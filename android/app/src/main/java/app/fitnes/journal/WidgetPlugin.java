package app.fitnes.journal;

import android.content.Intent;
import android.content.SharedPreferences;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Lets the web app hand today's numbers to the home-screen widget. */
@CapacitorPlugin(name = "FitnesWidget")
public class WidgetPlugin extends Plugin {

    @PluginMethod
    public void update(PluginCall call) {
        SharedPreferences.Editor editor = getContext()
                .getSharedPreferences(FitnesWidget.PREFS, 0)
                .edit();
        for (String key : FitnesWidget.KEYS) {
            String value = call.getString(key);
            if (value != null) {
                editor.putString(key, value);
            }
        }
        editor.apply();
        FitnesWidget.refreshAll(getContext());
        call.resolve();
    }

    /** Opens another installed app (Samsung Health), which then syncs its latest data to Health Connect. */
    @PluginMethod
    public void openApp(PluginCall call) {
        String pkg = call.getString("package", "");
        Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(pkg);
        if (launch == null) {
            call.reject("not installed");
            return;
        }
        launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(launch);
        call.resolve();
    }
}
