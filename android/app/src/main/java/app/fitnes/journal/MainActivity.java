package app.fitnes.journal;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Set on intents from an evening reminder: show the app over the lock screen and wake the screen. */
    static final String EXTRA_DUE = "fitnes.due";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetPlugin.class);
        registerPlugin(ReminderPlugin.class);
        super.onCreate(savedInstanceState);
    }

    // BridgeActivity also calls this for the launch intent, so it covers a cold start too.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getBooleanExtra(EXTRA_DUE, false) && Build.VERSION.SDK_INT >= 27) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
    }
}
