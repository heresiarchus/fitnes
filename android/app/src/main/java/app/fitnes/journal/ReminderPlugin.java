package app.fitnes.journal;

import android.app.Activity;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.app.AlarmManager;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import androidx.activity.result.ActivityResult;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Evening reminders with a choice of how they appear (see ReminderReceiver). */
@CapacitorPlugin(name = "FitnesReminders")
public class ReminderPlugin extends Plugin {

    /** items: [{ id, at (ms), title, body, style }] — replaces the previous plan. */
    @PluginMethod
    public void schedule(PluginCall call) {
        JSArray items = call.getArray("items");
        try {
            ReminderReceiver.replaceAll(getContext(), items == null ? new JSONArray() : items);
            call.resolve();
        } catch (JSONException e) {
            call.reject("Bad reminder list", e);
        }
    }

    /** One reminder in a few seconds, outside the plan, to see how it looks. */
    @PluginMethod
    public void test(PluginCall call) {
        try {
            JSONObject it = new JSONObject();
            it.put("id", 4999);
            it.put("at", System.currentTimeMillis() + 1000L * call.getInt("seconds", 5));
            it.put("title", call.getString("title", "Fitnes"));
            it.put("body", call.getString("body", ""));
            it.put("style", call.getString("style", "notification"));
            it.put("sound", call.getString("sound", "default"));
            ReminderReceiver.arm(getContext(), it);
            call.resolve();
        } catch (JSONException e) {
            call.reject("Bad test reminder", e);
        }
    }

    @PluginMethod
    public void clearShown(PluginCall call) {
        ReminderReceiver.clearShown(getContext());
        call.resolve();
    }

    /** What the phone currently allows for each way of reminding. */
    @PluginMethod
    public void permissions(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        r.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        r.put("overlay", Settings.canDrawOverlays(ctx));
        boolean fullScreen = true;
        if (Build.VERSION.SDK_INT >= 34) {
            NotificationManager nm = ctx.getSystemService(NotificationManager.class);
            fullScreen = nm != null && nm.canUseFullScreenIntent();
        }
        r.put("fullScreen", fullScreen);
        boolean exact = true;
        if (Build.VERSION.SDK_INT >= 31) {
            AlarmManager am = ctx.getSystemService(AlarmManager.class);
            exact = am != null && am.canScheduleExactAlarms();
        }
        r.put("exact", exact);
        call.resolve(r);
    }

    /** Opens the system page where the owner switches a permission on. */
    @PluginMethod
    public void openSettings(PluginCall call) {
        String which = call.getString("which", "notifications");
        Context ctx = getContext();
        Uri pkg = Uri.parse("package:" + ctx.getPackageName());
        Intent i;
        if ("overlay".equals(which)) {
            i = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, pkg);
        } else if ("fullScreen".equals(which) && Build.VERSION.SDK_INT >= 34) {
            i = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, pkg);
        } else if ("exact".equals(which) && Build.VERSION.SDK_INT >= 31) {
            i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, pkg);
        } else {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            ctx.startActivity(i);
        } catch (Exception e) {
            ctx.startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        }
        call.resolve();
    }

    /** The evening screen is done: the app no longer shows over the lock screen. */
    @PluginMethod
    public void dueClosed(PluginCall call) {
        Activity a = getActivity();
        if (a != null && Build.VERSION.SDK_INT >= 27) {
            a.runOnUiThread(() -> {
                a.setShowWhenLocked(false);
                a.setTurnScreenOn(false);
            });
        }
        call.resolve();
    }

    private Ringtone playing;

    /** Plays a reminder sound once, to hear it before choosing. */
    @PluginMethod
    public void playSound(PluginCall call) {
        if (playing != null && playing.isPlaying()) playing.stop();
        Uri uri = ReminderReceiver.soundUri(getContext(), call.getString("sound", "default"));
        if (uri != null) {
            playing = RingtoneManager.getRingtone(getContext(), uri);
            if (playing != null) playing.play();
        }
        call.resolve();
    }

    /** The phone's own sound picker; resolves { sound: "uri:…", title } or {} when cancelled. */
    @PluginMethod
    public void pickSound(PluginCall call) {
        Intent i = new Intent(RingtoneManager.ACTION_RINGTONE_PICKER);
        i.putExtra(RingtoneManager.EXTRA_RINGTONE_TYPE, RingtoneManager.TYPE_NOTIFICATION);
        i.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_DEFAULT, true);
        i.putExtra(RingtoneManager.EXTRA_RINGTONE_SHOW_SILENT, false);
        String cur = call.getString("current", "");
        if (cur != null && cur.startsWith("uri:")) i.putExtra(RingtoneManager.EXTRA_RINGTONE_EXISTING_URI, Uri.parse(cur.substring(4)));
        startActivityForResult(call, i, "pickSoundResult");
    }

    @ActivityCallback
    private void pickSoundResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject r = new JSObject();
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            Uri uri = result.getData().getParcelableExtra(RingtoneManager.EXTRA_RINGTONE_PICKED_URI);
            if (uri != null) {
                Ringtone rt = RingtoneManager.getRingtone(getContext(), uri);
                r.put("sound", "uri:" + uri);
                r.put("title", rt != null ? rt.getTitle(getContext()) : "");
            }
        }
        call.resolve(r);
    }
}
