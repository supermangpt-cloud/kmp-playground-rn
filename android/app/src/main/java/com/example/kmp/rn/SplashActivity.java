package com.example.kmp.rn;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.appcompat.app.AppCompatActivity;

/**
 * Native launch screen. It is the launcher activity, shows the logo and app
 * name for {@link #SPLASH_MILLIS}, then replaces itself with the React Native
 * activity. It is purely native (no RN view) so the first frame is not blocked
 * on loading the JS bundle.
 */
public class SplashActivity extends AppCompatActivity {

    /** Must stay in sync with SPLASH_MILLIS in Splash.ets and SplashViewController.m. */
    public static final long SPLASH_MILLIS = 1000L;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable openMainActivity = () -> {
        startActivity(new Intent(SplashActivity.this, MainActivity.class));
        finish();
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_splash);
        handler.postDelayed(openMainActivity, SPLASH_MILLIS);
    }

    @Override
    protected void onDestroy() {
        // Backing out of the splash must not start MainActivity afterwards.
        handler.removeCallbacks(openMainActivity);
        super.onDestroy();
    }
}
