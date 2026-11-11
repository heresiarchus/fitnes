package app.fitnes.journal;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/**
 * Home-screen widget: today's weight, steps and walking minutes plus a button
 * that opens the day entry. The web app stores the values through WidgetPlugin;
 * values saved for an earlier date are shown as empty.
 */
public class FitnesWidget extends AppWidgetProvider {

    static final String PREFS = "fitnes_widget";
    static final String[] KEYS = {
        "date", "title", "empty", "action",
        "weightLabel", "weight", "stepsLabel", "steps", "walkLabel", "walk"
    };

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, FitnesWidget.class));
        for (int id : ids) {
            manager.updateAppWidget(id, build(context));
        }
    }

    private static RemoteViews build(Context context) {
        SharedPreferences p = context.getSharedPreferences(PREFS, 0);
        String today = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
        boolean fresh = today.equals(p.getString("date", ""));
        String empty = p.getString("empty", "—");

        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_fitnes);
        v.setTextViewText(R.id.w_title, p.getString("title", context.getString(R.string.widget_title)));
        v.setTextViewText(R.id.w_weight_label, p.getString("weightLabel", context.getString(R.string.widget_weight)));
        v.setTextViewText(R.id.w_steps_label, p.getString("stepsLabel", context.getString(R.string.widget_steps)));
        v.setTextViewText(R.id.w_walk_label, p.getString("walkLabel", context.getString(R.string.widget_walk)));
        v.setTextViewText(R.id.w_weight, fresh ? p.getString("weight", empty) : empty);
        v.setTextViewText(R.id.w_steps, fresh ? p.getString("steps", empty) : empty);
        v.setTextViewText(R.id.w_walk, fresh ? p.getString("walk", empty) : empty);
        v.setTextViewText(R.id.w_action, p.getString("action", context.getString(R.string.widget_action)));

        int flags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_root, PendingIntent.getActivity(context, 0, open, flags));

        Intent log = new Intent(Intent.ACTION_VIEW, Uri.parse("app.fitnes.journal://log"), context, MainActivity.class);
        log.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        v.setOnClickPendingIntent(R.id.w_action, PendingIntent.getActivity(context, 1, log, flags));
        return v;
    }
}
