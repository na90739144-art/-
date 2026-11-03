package ir.kafinet.hoshmand;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Locale;

/**
 * کافی‌نت هوشمند: نمایش سایت داخل WebView + میکروفون و صدای بومی.
 * - محتوا از assets و روی دامنهٔ مجازی appassets.androidplatform.net بارگذاری می‌شود.
 * - لینک‌های بیرونی (سایت‌های رسمی) در مرورگر گوشی باز می‌شوند، نه داخل برنامه.
 * - پل KHNative فقط برای صفحهٔ خود برنامه کار می‌کند.
 */
public class MainActivity extends AppCompatActivity {

    private static final String HOST = "appassets.androidplatform.net";
    private WebView web;
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private boolean ttsFaOk = false;
    private boolean wantListen = false;
    private String pendingSpeak = null;
    private float pendingRate = 0.9f;
    private ActivityResultLauncher<String> micPermission;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#FBF9F4"));
        setContentView(web);

        micPermission = registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
            if (granted && wantListen) beginListening();
            else if (!granted) { wantListen = false; js("window.khVoiceError&&khVoiceError('not-allowed')"); }
        });

        initTts();

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
                .setDomain(HOST)
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        web.addJavascriptInterface(new Bridge(), "KHNative");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (HOST.equals(u.getHost())) return false;
                String sc = u.getScheme();
                if ("https".equals(sc) || "http".equals(sc) || "mailto".equals(sc)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                }
                return true;
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (web.canGoBack()) {
                    web.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                }
            }
        });

        if (savedInstanceState == null) {
            web.loadUrl("https://" + HOST + "/assets/index.html");
        } else {
            web.restoreState(savedInstanceState);
        }
    }

    // ---------- پل جاوااسکریپت ----------
    private class Bridge {
        @JavascriptInterface
        public void startListening() {
            runOnUiThread(() -> {
                if (!trusted()) return;
                wantListen = true;
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO)
                        == PackageManager.PERMISSION_GRANTED) {
                    beginListening();
                } else {
                    micPermission.launch(Manifest.permission.RECORD_AUDIO);
                }
            });
        }

        @JavascriptInterface
        public void stopListening() {
            runOnUiThread(() -> {
                wantListen = false;
                if (recognizer != null) { try { recognizer.stopListening(); } catch (Exception ignored) { } }
            });
        }

        @JavascriptInterface
        public void speak(String text, float rate) {
            runOnUiThread(() -> { if (trusted()) speakNow(text, rate); });
        }

        @JavascriptInterface
        public void stopSpeaking() {
            runOnUiThread(() -> { pendingSpeak = null; if (tts != null) tts.stop(); });
        }
    }

    private boolean trusted() {
        String u = web == null ? null : web.getUrl();
        return u != null && Uri.parse(u).getHost() != null && HOST.equals(Uri.parse(u).getHost());
    }

    private void js(String code) {
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(code, null); });
    }

    // ---------- تشخیص گفتار ----------
    private void beginListening() {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            wantListen = false;
            js("window.khVoiceError&&khVoiceError('unavailable')");
            return;
        }
        if (recognizer != null) { try { recognizer.destroy(); } catch (Exception ignored) { } }
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onReadyForSpeech(Bundle params) { }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onEvent(int eventType, Bundle params) { }

            @Override
            public void onPartialResults(Bundle partialResults) { deliver(partialResults, false); }

            @Override
            public void onResults(Bundle results) { wantListen = false; deliver(results, true); }

            @Override
            public void onError(int error) {
                wantListen = false;
                String c;
                switch (error) {
                    case SpeechRecognizer.ERROR_NO_MATCH:
                    case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: c = "no-speech"; break;
                    case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: c = "not-allowed"; break;
                    case SpeechRecognizer.ERROR_NETWORK:
                    case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: c = "network"; break;
                    case SpeechRecognizer.ERROR_AUDIO: c = "audio-capture"; break;
                    case SpeechRecognizer.ERROR_CLIENT: c = "aborted"; break;
                    default: c = "error";
                }
                js("window.khVoiceError&&khVoiceError(" + JSONObject.quote(c) + ")");
            }
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fa-IR");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "fa-IR");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getPackageName());
        recognizer.startListening(i);
    }

    private void deliver(Bundle b, boolean fin) {
        ArrayList<String> r = b == null ? null : b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        String t = (r != null && !r.isEmpty()) ? r.get(0) : "";
        if (t.isEmpty() && !fin) return;
        js("window.khVoiceResult&&khVoiceResult(" + JSONObject.quote(t) + "," + fin + ")");
    }

    // ---------- خواندن با صدا ----------
    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS) { ttsReady = false; return; }
            int r = tts.setLanguage(new Locale("fa", "IR"));
            ttsFaOk = r != TextToSpeech.LANG_MISSING_DATA && r != TextToSpeech.LANG_NOT_SUPPORTED;
            ttsReady = true;
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { }
                @Override public void onDone(String id) { if ("kh_last".equals(id)) js("window.khSpeakDone&&khSpeakDone()"); }
                @Override public void onError(String id) { if ("kh_last".equals(id)) js("window.khSpeakDone&&khSpeakDone()"); }
            });
            if (pendingSpeak != null) { String p = pendingSpeak; pendingSpeak = null; speakNow(p, pendingRate); }
        });
    }

    private void speakNow(String text, float rate) {
        if (tts == null || !ttsReady) { pendingSpeak = text; pendingRate = rate; return; }
        if (!ttsFaOk) { js("window.khTtsMissing&&khTtsMissing()"); return; }
        tts.setSpeechRate(rate);
        tts.stop();
        int max = 3000;
        int n = 0;
        for (int p = 0; p < text.length(); p += max) {
            int end = Math.min(text.length(), p + max);
            boolean last = end >= text.length();
            tts.speak(text.substring(p, end), n == 0 ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD, null, last ? "kh_last" : "kh_" + n);
            n++;
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (recognizer != null) { try { recognizer.cancel(); } catch (Exception ignored) { } }
        if (tts != null) tts.stop();
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    protected void onDestroy() {
        if (recognizer != null) { try { recognizer.destroy(); } catch (Exception ignored) { } }
        if (tts != null) { tts.stop(); tts.shutdown(); }
        if (web != null) web.destroy();
        super.onDestroy();
    }
}
