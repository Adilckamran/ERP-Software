package pk.fruityfun.erp.booker.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import pk.fruityfun.erp.booker.BuildConfig
import pk.fruityfun.erp.booker.data.OfflineLocationStore
import pk.fruityfun.erp.booker.data.PendingLocationEntity
import java.time.Instant
import java.time.LocalTime
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Genuine Native Android Foreground Service for Authorized Working-Hour Booker Tracking.
 * - Uses native Android LocationManager (GPS_PROVIDER + NETWORK_PROVIDER) and FOREGROUND_SERVICE_TYPE_LOCATION.
 * - Displays a mandatory persistent notification while tracking is active.
 * - Continues when screen is locked or app is minimized.
 * - Respects authorized working hours (08:30 - 18:30) and stops immediately when booker ends duty.
 * - Stores location points in local SQLite queue (OfflineLocationStore) if offline and synchronizes when connectivity returns.
 */
class LocationTrackingForegroundService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var locationManager: LocationManager
    private lateinit var offlineStore: OfflineLocationStore
    private var locationListener: LocationListener? = null

    private var bookerId: String = "user-booker-1"
    private val workingStart: LocalTime = LocalTime.of(8, 30)
    private val workingEnd: LocalTime = LocalTime.of(18, 30)

    override fun onCreate() {
        super.onCreate()
        locationManager = getSystemService(Context.LOCATION_SERVICE) as LocationManager
        offlineStore = OfflineLocationStore(applicationContext)
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START_DUTY_TRACKING -> {
                bookerId = intent.getStringExtra(EXTRA_BOOKER_ID) ?: "user-booker-1"
                startForegroundLocationTracking()
            }
            ACTION_STOP_DUTY_TRACKING -> {
                stopForegroundLocationTracking()
            }
        }
        return START_STICKY
    }

    private fun startForegroundLocationTracking() {
        val notification = buildPersistentNotification(
            "Fruity Fun Juice Factory Duty Active",
            "Live GPS route & shop visit tracking is active during working hours."
        )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                handleNewLocationPoint(location)
            }

            @Deprecated("Deprecated in Java")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
            override fun onProviderEnabled(provider: String) {}
            override fun onProviderDisabled(provider: String) {}
        }
        locationListener = listener

        try {
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    15_000L,
                    15f,
                    listener,
                    Looper.getMainLooper()
                )
            }
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    30_000L,
                    25f,
                    listener,
                    Looper.getMainLooper()
                )
            }
        } catch (_: SecurityException) {
            stopForegroundLocationTracking()
        }
    }

    private fun handleNewLocationPoint(location: Location) {
        val nowLocal = LocalTime.now()
        if (nowLocal.isBefore(workingStart) || nowLocal.isAfter(workingEnd)) {
            stopForegroundLocationTracking()
            return
        }

        val batteryManager = getSystemService(Context.BATTERY_SERVICE) as BatteryManager
        val batteryPct = batteryManager.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY)
        val speedKmh = (location.speed * 3.6f).coerceAtLeast(0f)

        val entity = PendingLocationEntity(
            bookerId = bookerId,
            latitude = location.latitude,
            longitude = location.longitude,
            accuracyMeters = location.accuracy,
            speedKmh = speedKmh,
            batteryPct = batteryPct.coerceIn(0, 100),
            isMoving = speedKmh > 1.5f,
            recordedAtIso = Instant.now().toString(),
            synced = false
        )

        serviceScope.launch {
            offlineStore.insertPendingPoint(entity)
            offlineStore.flushOfflineQueueToServer(BuildConfig.ERP_API_BASE_URL, bookerId)
        }
    }

    private fun stopForegroundLocationTracking() {
        locationListener?.let { listener ->
            try {
                locationManager.removeUpdates(listener)
            } catch (_: Exception) {
            }
        }
        locationListener = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Fruity Fun Booker Active Duty GPS Tracking",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Persistent indicator while Fruity Fun Booker Duty GPS tracking is active"
            }
            val manager = getSystemService(NotificationManager::class.java)
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildPersistentNotification(title: String, body: String): Notification {
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(body)
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .build()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        serviceScope.cancel()
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "fruity_fun_booker_gps_channel"
        const val NOTIFICATION_ID = 4001
        const val ACTION_START_DUTY_TRACKING = "pk.fruityfun.erp.booker.START_DUTY"
        const val ACTION_STOP_DUTY_TRACKING = "pk.fruityfun.erp.booker.STOP_DUTY"
        const val EXTRA_BOOKER_ID = "extra_booker_id"

        fun distanceMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
            val r = 6371000.0
            val dLat = Math.toRadians(lat2 - lat1)
            val dLon = Math.toRadians(lon2 - lon1)
            val a = sin(dLat / 2).pow(2.0) +
                    cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                    sin(dLon / 2).pow(2.0)
            return 2 * r * atan2(sqrt(a), sqrt(1 - a))
        }
    }
}
