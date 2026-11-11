package app.fitnes.journal;

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
}
