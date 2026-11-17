package app.fitnes.journal;

import android.annotation.SuppressLint;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * Evening reminders. Each planned reminder is an exact alarm; when it fires the reminder
 * is shown in the chosen way:
 *  - "notification": an ordinary notification that stays until the day is filled;
 *  - "headsup": a banner over whatever is on screen (high-importance channel);
 *  - "fullscreen": the app's evening screen opens by itself — over other apps when
 *    "display over other apps" is allowed, and over the lock screen through a
 *    full-screen notification.
 * The plan is kept in preferences so it survives a restart of the phone.
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String PREFS = "fitnes_reminders";
    static final String KEY_ITEMS = "items";
    static final String KEY_SHOWN = "shown";
    static final String ACTION_FIRE = "app.fitnes.journal.REMIND";
    static final String CH_NORMAL = "evening";
    static final String CH_POPUP = "evening_popup";

    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (!ACTION_FIRE.equals(intent.getAction())) return;
        show(ctx, intent.getIntExtra("id", 1), intent.getStringExtra("title"), intent.getStringExtra("body"), intent.getStringExtra("style"), intent.getStringExtra("sound"));
    }

    static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Opens the app on its evening screen. */
    static Intent dueIntent(Context ctx) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setAction(Intent.ACTION_VIEW);
        i.setData(Uri.parse("app.fitnes.journal://due"));
        i.putExtra(MainActivity.EXTRA_DUE, true);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return i;
    }

    /** "raw:name" (a sound shipped with the app), "uri:…" (picked on the phone), "default" or "none". */
    static Uri soundUri(Context ctx, String sound) {
        if (sound == null || sound.isEmpty() || "default".equals(sound)) return Settings.System.DEFAULT_NOTIFICATION_URI;
        if ("none".equals(sound)) return null;
        if (sound.startsWith("raw:")) return Uri.parse("android.resource://" + ctx.getPackageName() + "/raw/" + sound.substring(4));
        if (sound.startsWith("uri:")) return Uri.parse(sound.substring(4));
        return Settings.System.DEFAULT_NOTIFICATION_URI;
    }

    /**
     * A channel's sound can't change after it is created, so each sound gets its own channel
     * (id ends with a key of the sound); channels for sounds no longer used are removed.
     */
    static String ensureChannel(Context ctx, boolean popup, String sound) {
        NotificationManager nm = ctx.getSystemService(NotificationManager.class);
        String key = sound == null || sound.isEmpty() ? "default" : Integer.toHexString(sound.hashCode());
        String id = (popup ? CH_POPUP : CH_NORMAL) + "_" + key;
        if (nm == null) return id;
        if (nm.getNotificationChannel(id) == null) {
            NotificationChannel c = popup
                    ? new NotificationChannel(id, "Вечірня перевірка — поверх екрана", NotificationManager.IMPORTANCE_HIGH)
                    : new NotificationChannel(id, "Вечірня перевірка", NotificationManager.IMPORTANCE_DEFAULT);
            c.setDescription("Нагадування заповнити день");
            c.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            Uri uri = soundUri(ctx, sound);
            AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build();
            c.setSound(uri, uri == null ? null : attrs);
            c.enableVibration(true);
            c.setVibrationPattern(new long[]{0, 220, 140, 220});
            nm.createNotificationChannel(c);
        }
        for (NotificationChannel c : nm.getNotificationChannels()) {
            String cid = c.getId();
            if (cid.startsWith(CH_NORMAL) && !cid.endsWith("_" + key)) nm.deleteNotificationChannel(cid);
        }
        return id;
    }

    @SuppressLint("MissingPermission")
    static void show(Context ctx, int id, String title, String body, String style, String sound) {
        boolean full = "fullscreen".equals(style);
        boolean popup = full || "headsup".equals(style);
        String channel = ensureChannel(ctx, popup, sound);
        PendingIntent open = PendingIntent.getActivity(ctx, id, dueIntent(ctx), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, channel)
                .setSmallIcon(R.drawable.ic_stat_fitnes)
                .setContentTitle(title == null ? "Fitnes" : title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(open)
                .setOngoing(true)
                .setAutoCancel(false)
                .setOnlyAlertOnce(false)
                .setCategory(full ? NotificationCompat.CATEGORY_ALARM : NotificationCompat.CATEGORY_REMINDER)
                .setPriority(popup ? NotificationCompat.PRIORITY_HIGH : NotificationCompat.PRIORITY_DEFAULT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        if (full) b.setFullScreenIntent(open, true);
        NotificationManagerCompat nm = NotificationManagerCompat.from(ctx);
        // Evening repeats replace each other: one notification at a time.
        clearShown(ctx);
        if (nm.areNotificationsEnabled()) {
            try {
                nm.notify(id, b.build());
                prefs(ctx).edit().putString(KEY_SHOWN, String.valueOf(id)).apply();
            } catch (SecurityException ignored) {
                // Notifications not allowed: the full-screen start below still works.
            }
        }
        if (full && Settings.canDrawOverlays(ctx)) {
            // With "display over other apps" Android lets the app come to the front by itself.
            try {
                ctx.startActivity(dueIntent(ctx));
            } catch (Exception ignored) {
                // The notification above is the fallback.
            }
        }
    }

    static PendingIntent firePending(Context ctx, JSONObject it) throws JSONException {
        int id = it.getInt("id");
        Intent i = new Intent(ctx, ReminderReceiver.class)
                .setAction(ACTION_FIRE)
                .setData(Uri.parse("fitnes-remind://" + id))
                .putExtra("id", id)
                .putExtra("title", it.optString("title", "Fitnes"))
                .putExtra("body", it.optString("body", ""))
                .putExtra("style", it.optString("style", "notification"))
                .putExtra("sound", it.optString("sound", "default"));
        return PendingIntent.getBroadcast(ctx, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void arm(Context ctx, JSONObject it) throws JSONException {
        long at = it.getLong("at");
        if (at <= System.currentTimeMillis()) return;
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        if (am == null) return;
        PendingIntent pi = firePending(ctx, it);
        boolean exact = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms();
        try {
            if (exact) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
        }
    }

    /** Replaces the whole plan: old alarms are cancelled, the new ones armed and remembered. */
    static void replaceAll(Context ctx, JSONArray items) throws JSONException {
        SharedPreferences p = prefs(ctx);
        AlarmManager am = ctx.getSystemService(AlarmManager.class);
        JSONArray old = new JSONArray(p.getString(KEY_ITEMS, "[]"));
        for (int i = 0; i < old.length(); i++) {
            if (am != null) am.cancel(firePending(ctx, old.getJSONObject(i)));
        }
        for (int i = 0; i < items.length(); i++) arm(ctx, items.getJSONObject(i));
        p.edit().putString(KEY_ITEMS, items.toString()).apply();
    }

    /** After a restart of the phone or an app update alarms are gone: arm the remembered plan again. */
    static void rearm(Context ctx) {
        try {
            JSONArray items = new JSONArray(prefs(ctx).getString(KEY_ITEMS, "[]"));
            for (int i = 0; i < items.length(); i++) arm(ctx, items.getJSONObject(i));
        } catch (JSONException ignored) {
            // Nothing to restore.
        }
    }

    /** Removes the evening notification once the day is filled. */
    static void clearShown(Context ctx) {
        String shown = prefs(ctx).getString(KEY_SHOWN, "");
        if (shown.isEmpty()) return;
        try {
            NotificationManagerCompat.from(ctx).cancel(Integer.parseInt(shown));
        } catch (NumberFormatException ignored) {
            // Corrupt value: forget it.
        }
        prefs(ctx).edit().remove(KEY_SHOWN).apply();
    }
}
