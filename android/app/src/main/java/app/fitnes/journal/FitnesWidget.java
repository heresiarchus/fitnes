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
        "g1Label", "g1Value", "g1Pct", "g2Label", "g2Value", "g2Pct", "g3Label", "g3Value", "g3Pct"
    };
    private static final int[][] ROWS = {
        {R.id.w_g1, R.id.w_g1_label, R.id.w_g1_value, R.id.w_g1_bar},
        {R.id.w_g2, R.id.w_g2_label, R.id.w_g2_value, R.id.w_g2_bar},
        {R.id.w_g3, R.id.w_g3_label, R.id.w_g3_value, R.id.w_g3_bar},
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
        // Up to three goals: label, "value / target" and a progress bar. Values from another day show as empty.
        for (int i = 0; i < ROWS.length; i++) {
            String n = "g" + (i + 1);
            String label = p.getString(n + "Label", "");
            v.setViewVisibility(ROWS[i][0], label.isEmpty() ? android.view.View.GONE : android.view.View.VISIBLE);
            v.setTextViewText(ROWS[i][1], label);
            v.setTextViewText(ROWS[i][2], fresh ? p.getString(n + "Value", empty) : empty);
            int pct = 0;
            try { pct = fresh ? Integer.parseInt(p.getString(n + "Pct", "0")) : 0; } catch (NumberFormatException ignored) { }
            v.setProgressBar(ROWS[i][3], 100, pct, false);
        }
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
