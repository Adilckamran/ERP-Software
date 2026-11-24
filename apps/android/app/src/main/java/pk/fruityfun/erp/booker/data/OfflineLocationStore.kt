package pk.fruityfun.erp.booker.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

data class PendingLocationEntity(
    val localId: Long = 0,
    val bookerId: String,
    val latitude: Double,
    val longitude: Double,
    val accuracyMeters: Float,
    val speedKmh: Float,
    val batteryPct: Int,
    val isMoving: Boolean,
    val recordedAtIso: String,
    val synced: Boolean = false
)

/**
 * Native SQLite Offline Location Store + Batch Synchronization Engine
 * Guarantees zero lost GPS telemetry points during cellular network interruptions.
 */
class OfflineLocationStore(context: Context) :
    SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS $TABLE_NAME (
                local_id INTEGER PRIMARY KEY AUTOINCREMENT,
                booker_id TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                accuracy_meters REAL NOT NULL,
                speed_kmh REAL NOT NULL,
                battery_pct INTEGER NOT NULL,
                is_moving INTEGER NOT NULL,
                recorded_at_iso TEXT NOT NULL,
                synced INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS $TABLE_NAME")
        onCreate(db)
    }

    @Synchronized
    fun insertPendingPoint(point: PendingLocationEntity): Long {
        val values = ContentValues().apply {
            put("booker_id", point.bookerId)
            put("latitude", point.latitude)
            put("longitude", point.longitude)
            put("accuracy_meters", point.accuracyMeters)
            put("speed_kmh", point.speedKmh)
            put("battery_pct", point.batteryPct)
            put("is_moving", if (point.isMoving) 1 else 0)
            put("recorded_at_iso", point.recordedAtIso)
            put("synced", 0)
        }
        return writableDatabase.insert(TABLE_NAME, null, values)
    }

    @Synchronized
    fun getUnsyncedPoints(limit: Int = 100): List<PendingLocationEntity> {
        val list = mutableListOf<PendingLocationEntity>()
        val cursor = readableDatabase.query(
            TABLE_NAME,
            null,
            "synced = 0",
            null,
            null,
            null,
            "local_id ASC",
            limit.toString()
        )
        cursor.use { c ->
            while (c.moveToNext()) {
                list.add(
                    PendingLocationEntity(
                        localId = c.getLong(c.getColumnIndexOrThrow("local_id")),
                        bookerId = c.getString(c.getColumnIndexOrThrow("booker_id")),
                        latitude = c.getDouble(c.getColumnIndexOrThrow("latitude")),
                        longitude = c.getDouble(c.getColumnIndexOrThrow("longitude")),
                        accuracyMeters = c.getFloat(c.getColumnIndexOrThrow("accuracy_meters")),
                        speedKmh = c.getFloat(c.getColumnIndexOrThrow("speed_kmh")),
                        batteryPct = c.getInt(c.getColumnIndexOrThrow("battery_pct")),
                        isMoving = c.getInt(c.getColumnIndexOrThrow("is_moving")) == 1,
                        recordedAtIso = c.getString(c.getColumnIndexOrThrow("recorded_at_iso")),
                        synced = c.getInt(c.getColumnIndexOrThrow("synced")) == 1
                    )
                )
            }
        }
        return list
    }

    @Synchronized
    fun markPointsSynced(ids: List<Long>) {
        if (ids.isEmpty()) return
        val idList = ids.joinToString(",")
        writableDatabase.execSQL("UPDATE $TABLE_NAME SET synced = 1 WHERE local_id IN ($idList)")
    }

    @Synchronized
    fun countUnsyncedPoints(): Int {
        val cursor = readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM $TABLE_NAME WHERE synced = 0",
            null
        )
        cursor.use { c ->
            return if (c.moveToFirst()) c.getInt(0) else 0
        }
    }

    /**
     * Attempts to flush all unsynced offline GPS points to `/api/erp` (`SYNC_OFFLINE_GPS_BATCH`).
     */
    fun flushOfflineQueueToServer(baseUrl: String, bookerId: String): Boolean {
        val pending = getUnsyncedPoints(100)
        if (pending.isEmpty()) return true

        return try {
            val endpoint = URL("${baseUrl.trimEnd('/')}/api/erp")
            val conn = (endpoint.openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                connectTimeout = 8000
                readTimeout = 8000
                doOutput = true
                setRequestProperty("Content-Type", "application/json")
            }

            val pointsJson = JSONArray()
            pending.forEach { pt ->
                pointsJson.put(
                    JSONObject().apply {
                        put("latitude", pt.latitude)
                        put("longitude", pt.longitude)
                        put("accuracy_meters", pt.accuracyMeters.toDouble())
                        put("speed_kmh", pt.speedKmh.toDouble())
                        put("battery_pct", pt.batteryPct)
                        put("is_moving", pt.isMoving)
                        put("recorded_at", pt.recordedAtIso)
                    }
                )
            }

            val rootJson = JSONObject().apply {
                put("action", "SYNC_OFFLINE_GPS_BATCH")
                put("actorId", bookerId)
                put(
                    "payload",
                    JSONObject().apply {
                        put("booker_id", bookerId)
                        put("points", pointsJson)
                    }
                )
            }

            OutputStreamWriter(conn.outputStream, Charsets.UTF_8).use { writer ->
                writer.write(rootJson.toString())
                writer.flush()
            }

            val code = conn.responseCode
            if (code in 200..299) {
                markPointsSynced(pending.map { it.localId })
                true
            } else {
                false
            }
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        private const val DB_NAME = "fruity_fun_booker_offline.db"
        private const val DB_VERSION = 1
        private const val TABLE_NAME = "pending_location_points"
    }
}
