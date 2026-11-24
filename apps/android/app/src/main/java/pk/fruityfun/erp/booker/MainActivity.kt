package pk.fruityfun.erp.booker

import android.Manifest
import android.content.Intent
import android.graphics.Color
import android.graphics.Typeface
import android.os.Build
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.GridLayout
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import pk.fruityfun.erp.booker.data.OfflineLocationStore
import pk.fruityfun.erp.booker.data.PendingLocationEntity
import pk.fruityfun.erp.booker.location.LocationTrackingForegroundService
import java.time.Instant

enum class BookerScreen(val title: String, val description: String) {
    DASHBOARD("1. Dashboard", "Live daily sales, assigned shop count, and active duty status."),
    ASSIGNED_AREAS("2. Assigned Areas", "Gulberg & Liberty Zone • DHA & Cantt Commercial."),
    ASSIGNED_SHOPS("3. Assigned Shops", "Ahmed Cash & Carry • Bilal Beverages • Defence Gourmet."),
    CUSTOMER_REGISTRATION("4. Customer Reg", "Register new dealer/shop in assigned area with GPS coordinates."),
    NEW_ORDER("5. New Order", "Select shop, product, flavour, bottle size, carton qty, and submit with idempotency key."),
    ORDER_HISTORY("6. Order History", "Track Pending, Approved, Dispatched, and Delivered orders."),
    PAYMENT_COLLECTION("7. Collection", "Record Cash or Bank Transfer receipt against dealer ledger."),
    CUSTOMER_LEDGER("8. Ledger", "View Debit, Credit, and running receivable balance per shop."),
    DAILY_SALES("9. Daily Sales", "Carton breakdown and revenue summary for today's shift."),
    DAILY_VISITS("10. Visit History", "Geofence-detected and manually confirmed shop visit durations."),
    GPS_TRACKING("11. GPS Duty", "Start/End Foreground Location Service & flush offline SQLite GPS queue."),
    PROFILE("12. Profile", "Booker identity, authorized working hours (08:30-18:30), and RBAC scope.")
}

class MainActivity : ComponentActivity() {

    private lateinit var offlineStore: OfflineLocationStore
    private var isOnDuty = true
    private var activeScreen = BookerScreen.DASHBOARD
    private val currentBookerId = "user-booker-1"

    private lateinit var statusLabel: TextView
    private lateinit var moduleTitleView: TextView
    private lateinit var moduleDescView: TextView
    private lateinit var queueStatusView: TextView

    private val permissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { _ -> }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        offlineStore = OfflineLocationStore(applicationContext)
        requestRequiredLocationPermissions()

        val rootScroll = ScrollView(this).apply {
            setBackgroundColor(Color.parseColor("#0B192C"))
        }

        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(36, 48, 36, 48)
        }

        val titleView = TextView(this).apply {
            text = "FRUITY FUN JUICE FACTORY • BOOKER APK"
            textSize = 18f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.WHITE)
        }
        container.addView(titleView)

        statusLabel = TextView(this).apply {
            text = "Booker: Usman Tariq • Duty: ON_DUTY (Foreground GPS Active)"
            textSize = 13f
            setTextColor(Color.parseColor("#10B981"))
            setPadding(0, 8, 0, 24)
        }
        container.addView(statusLabel)

        val dutyToggleBtn = Button(this).apply {
            text = "Toggle Duty & Foreground GPS Service"
            setBackgroundColor(Color.parseColor("#059669"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                isOnDuty = !isOnDuty
                if (isOnDuty) {
                    startDutyGps(currentBookerId)
                    statusLabel.text = "Booker: Usman Tariq • Duty: ON_DUTY (Foreground GPS Active)"
                } else {
                    stopDutyGps()
                    statusLabel.text = "Booker: Usman Tariq • Duty: OFF_DUTY (GPS Stopped)"
                }
            }
        }
        container.addView(dutyToggleBtn)

        val grid = GridLayout(this).apply {
            columnCount = 3
            setPadding(0, 24, 0, 24)
        }

        BookerScreen.entries.forEach { screen ->
            val btn = Button(this).apply {
                text = screen.title
                textSize = 11f
                setOnClickListener {
                    activeScreen = screen
                    refreshScreenContent()
                }
            }
            grid.addView(btn)
        }
        container.addView(grid)

        moduleTitleView = TextView(this).apply {
            textSize = 17f
            setTypeface(typeface, Typeface.BOLD)
            setTextColor(Color.parseColor("#10B981"))
            setPadding(0, 16, 0, 8)
        }
        container.addView(moduleTitleView)

        moduleDescView = TextView(this).apply {
            textSize = 14f
            setTextColor(Color.parseColor("#E2E8F0"))
            setPadding(0, 0, 0, 20)
        }
        container.addView(moduleDescView)

        queueStatusView = TextView(this).apply {
            textSize = 13f
            setTextColor(Color.parseColor("#38BDF8"))
            setPadding(0, 8, 0, 16)
        }
        container.addView(queueStatusView)

        val queueOfflinePingBtn = Button(this).apply {
            text = "Queue Offline GPS Point & Sync with ERP Server"
            setBackgroundColor(Color.parseColor("#059669"))
            setTextColor(Color.WHITE)
            setOnClickListener {
                lifecycleScope.launch {
                    withContext(Dispatchers.IO) {
                        offlineStore.insertPendingPoint(
                            PendingLocationEntity(
                                bookerId = currentBookerId,
                                latitude = 31.5102,
                                longitude = 74.3441,
                                accuracyMeters = 6.0f,
                                speedKmh = 0.0f,
                                batteryPct = 88,
                                isMoving = false,
                                recordedAtIso = Instant.now().toString()
                            )
                        )
                        offlineStore.flushOfflineQueueToServer(
                            BuildConfig.ERP_API_BASE_URL,
                            currentBookerId
                        )
                    }
                    refreshScreenContent()
                }
            }
        }
        container.addView(queueOfflinePingBtn)

        rootScroll.addView(container)
        setContentView(rootScroll)
        refreshScreenContent()
    }

    private fun refreshScreenContent() {
        moduleTitleView.text = activeScreen.title
        moduleDescView.text = activeScreen.description
        val unsyncedCount = offlineStore.countUnsyncedPoints()
        queueStatusView.text =
            "Offline SQLite Queue: $unsyncedCount pending GPS points • API: ${BuildConfig.ERP_API_BASE_URL}"
    }

    private fun startDutyGps(bookerId: String) {
        val intent = Intent(this, LocationTrackingForegroundService::class.java).apply {
            action = LocationTrackingForegroundService.ACTION_START_DUTY_TRACKING
            putExtra(LocationTrackingForegroundService.EXTRA_BOOKER_ID, bookerId)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun stopDutyGps() {
        val intent = Intent(this, LocationTrackingForegroundService::class.java).apply {
            action = LocationTrackingForegroundService.ACTION_STOP_DUTY_TRACKING
        }
        startService(intent)
    }

    private fun requestRequiredLocationPermissions() {
        val perms = mutableListOf(
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.ACCESS_COARSE_LOCATION
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            perms.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        permissionLauncher.launch(perms.toTypedArray())
    }
}
