import { useState, useCallback, useRef, useEffect } from 'react';
import { Moon, Sun, Home, LogOut, LogIn, Shield, Clock, Wifi, X, Flame, HelpCircle, Menu } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import CameraFeed from '@/components/dashboard/CameraFeed';
import FusedDetectionView from '@/components/dashboard/FusedDetectionView';
import AlertLog from '@/components/dashboard/AlertLog';
import ControlsPanel from '@/components/dashboard/ControlsPanel';
import AttentionGauge from '@/components/dashboard/AttentionGauge';
import DetectionFeedback from '@/components/dashboard/DetectionFeedback';
import ModelCachePanel from '@/components/dashboard/ModelCachePanel';
import TutorialOverlay, { type TutorialStep } from '@/components/dashboard/TutorialOverlay';

import { useCamera } from '@/hooks/useCamera';
import { useAudioAnalysis } from '@/hooks/useAudioAnalysis';
import { useObjectDetection } from '@/hooks/useObjectDetection';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useAuth } from '@/hooks/useAuth';
import { useHousehold } from '@/hooks/useHousehold';
import { useIpCamera } from '@/hooks/useIpCamera';
import { useFaceDistress } from '@/hooks/useFaceDistress';
import { useYamnet } from '@/hooks/useYamnet';
import { detectFire, createFireState } from '@/lib/fireDetection';
import type { SaliencyMode, QualityMode, Alert, DetectedObject } from '@/types/dashboard';
import { DEFAULT_PRIORITY_OBJECTS } from '@/types/dashboard';

export default function Index() {
  const { user, loading: authLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { householdId, wakeWords, members, checkForWakeWord, logAlert, logNotification } = useHousehold(user?.id);
  const { cameras, devices, startCameras, stopCameras, updateCamera, attachStream, enumerateDevices, startSpecificCamera } = useCamera();
  const { audioFeatures, startAudio, stopAudio } = useAudioAnalysis();
  const { loadModel, detect, stats: detectionStats } = useObjectDetection();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('safewatch-dark-mode');
    if (saved === 'true') {
      document.documentElement.classList.add('dark');
      return true;
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('safewatch-dark-mode', String(darkMode));
  }, [darkMode]);

  // Auto-launch onboarding tutorial once per signed-in user
  useEffect(() => {
    if (authLoading) return;
    const key = user ? `msds-tutorial-done-${user.id}` : 'msds-tutorial-done-guest';
    if (!localStorage.getItem(key)) {
      // Small delay so panels have mounted and refs exist
      const t = setTimeout(() => setShowTutorial(true), 600);
      return () => clearTimeout(t);
    }
  }, [authLoading, user]);

  const tutorialSteps: TutorialStep[] = [
    {
      selector: '#tour-header',
      placement: 'bottom',
      title: 'Welcome to MSDSystem',
      body: 'This is your Multimodal Saliency Detection dashboard. I will walk you through the key panels and what each one does.',
      narration: 'Welcome to the Multimodal Saliency Detection dashboard. I will guide you through each part.',
    },
    {
      selector: '#tour-start',
      placement: 'left',
      title: 'Start Monitoring',
      body: 'Press this to activate the full detection pipeline: camera capture, saliency, object detection, audio, and emergency reasoning.',
      narration: 'Press Start Monitoring to activate the full detection pipeline.',
    },
    {
      selector: '#tour-cams',
      childIndex: 1,
      placement: 'bottom',
      title: 'CAM 1 — Raw Feed',
      body: 'Your live camera stream. Bounding boxes and low-level saliency overlays are drawn here so you can see what the system is seeing.',
      narration: 'This is the raw live feed. Bounding boxes appear here as objects are detected.',
    },
    {
      selector: '#tour-cams',
      childIndex: 2,
      placement: 'bottom',
      title: 'CAM 2 — Fused Detection',
      body: 'The fused detection view combines vision, audio, speech, and face analysis to infer activity, distress, fire, and emergencies.',
      narration: 'This panel fuses vision, audio, speech and face signals to infer the current situation.',
    },
    {
      selector: '#tour-sidebar',
      childIndex: 2,
      placement: 'left',
      title: 'Attention Score',
      body: 'A single 0 to 100 score summarising how much the system currently believes something important is happening. Higher means more attention needed.',
      narration: 'This is the attention score, a summary of how urgent the current scene looks.',
    },
    {
      selector: '#tour-sidebar',
      childIndex: 3,
      placement: 'left',
      title: 'Audio Meter & Talking AI',
      body: 'Live decibel, speech, and distress sound analysis. Wake words and screams are picked up here and can trigger the emergency response.',
      narration: 'The audio meter listens for speech, wake words, and distress sounds like screams.',
    },
    {
      selector: '#tour-sidebar',
      childIndex: 4,
      placement: 'left',
      title: 'Alert Log',
      body: 'Every important event lands here with a timestamp, severity, and snapshot. Click an alert to review the moment it was captured.',
      narration: 'All events and alerts are logged here for review.',
    },
    {
      selector: '#tour-sidebar',
      childIndex: 6,
      placement: 'left',
      title: 'Controls',
      body: 'Toggle bounding boxes, heatmap, alerts, quality, and which objects the system should treat as priority. You can also export a session as CSV here.',
      narration: 'Use the controls to tune detection, choose priority objects, and export session data.',
    },
    {
      selector: '#tour-header',
      placement: 'center',
      title: 'You are ready',
      body: 'Connect a camera, press Start Monitoring, and the system will begin listening and watching. You can replay this tour anytime from the help icon.',
      narration: 'You are ready. Connect a camera and press Start Monitoring to begin.',
    },
  ];
  const { transcript, interimTranscript, isListening: speechListening, supported: speechSupported, start: startSpeech, stop: stopSpeech, clear: clearSpeech } = useSpeechRecognition();
  const [showEmergency, setShowEmergency] = useState(false);

  const [running, setRunning] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [saliencyMode, setSaliencyMode] = useState<SaliencyMode>('sobel');
  const [threshold, setThreshold] = useState(15);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);
  const [quality, setQuality] = useState<QualityMode>('SD');
  const [mirror, setMirror] = useState(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState(50);
  const [simulationMode, setSimulationMode] = useState(false);
  const [priorityObjects, setPriorityObjects] = useState<string[]>(DEFAULT_PRIORITY_OBJECTS);
  const [minConfidence, setMinConfidence] = useState(20); // percentage 0-100
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [errors] = useState<string[]>([]);
  const [attentionScore, setAttentionScore] = useState(0);
  const [globalSaliencyScore, setGlobalSaliencyScore] = useState(0);

  const [sourceCanvas, setSourceCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cam2SourceCanvas, setCam2SourceCanvas] = useState<HTMLCanvasElement | null>(null);

  // Camera-connection gating: detection only runs while at least one
  // webcam or IP/CCTV stream is connected. UI message reflects state.
  const [cameraStatusMsg, setCameraStatusMsg] = useState<string>(
    'No camera connected. Please connect a webcam or CCTV/IP camera.'
  );

  // Auto-detect available cameras on mount so the Connect picker is populated
  // before the user clicks Start. Browsers won't expose device labels until
  // permission is granted, but deviceIds are enough to count availability.
  useEffect(() => {
    enumerateDevices().then(list => {
      if (!list || list.length === 0) {
        setCameraStatusMsg('No camera detected. Connect a webcam or CCTV/IP camera.');
      }
    }).catch(() => {});
    if (navigator.mediaDevices && 'addEventListener' in navigator.mediaDevices) {
      const onChange = () => { enumerateDevices(); };
      navigator.mediaDevices.addEventListener('devicechange', onChange);
      return () => navigator.mediaDevices.removeEventListener('devicechange', onChange);
    }
  }, [enumerateDevices]);

  // IP camera state
  const [showIpDialog, setShowIpDialog] = useState(false);
  const [ipUrl, setIpUrl] = useState('');
  const [ipKind, setIpKind] = useState<'hls' | 'mjpeg' | 'image'>('hls');
  // Single-camera mode: everything runs on CAM 2 (slot index 0 internally as the
  // sole detection source). We keep constants so downstream logic stays intact.
  const ipTargetSlot = 1;
  const localTargetSlot = 1;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const ipCam = useIpCamera();

  // Test video upload — feeds an uploaded video file into a slot as a MediaStream
  const testVideoRef = useRef<HTMLVideoElement | null>(null);
  const [testVideoName, setTestVideoName] = useState<string>('');
  const pendingVideoRef = useRef<{ file: File; slot: number } | null>(null);
  const startPendingTestVideo = useCallback(async () => {
    const pending = pendingVideoRef.current;
    if (!pending) return false;
    const { file, slot } = pending;
    try {
      // Recreate the hidden source video every upload so switching files works.
      if (testVideoRef.current) {
        try { testVideoRef.current.pause(); } catch {}
        try { URL.revokeObjectURL(testVideoRef.current.src); } catch {}
        testVideoRef.current.removeAttribute('src');
        testVideoRef.current.load();
        if (testVideoRef.current.parentNode) testVideoRef.current.parentNode.removeChild(testVideoRef.current);
        testVideoRef.current = null;
      }
      const v = document.createElement('video');
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.autoplay = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:2px;height:2px;opacity:0;pointer-events:none;';
      document.body.appendChild(v);
      testVideoRef.current = v;
      const url = URL.createObjectURL(file);
      v.src = url;
      await new Promise<void>((resolve, reject) => {
        const onMeta = () => { cleanup(); resolve(); };
        const onErr = () => { cleanup(); reject(new Error('video load error: ' + (v.error?.message || 'unknown'))); };
        const cleanup = () => {
          v.removeEventListener('loadedmetadata', onMeta);
          v.removeEventListener('error', onErr);
        };
        v.addEventListener('loadedmetadata', onMeta, { once: true });
        v.addEventListener('error', onErr, { once: true });
      });
      // @ts-expect-error captureStream typing varies across browsers
      const capture = v.captureStream ? v.captureStream.bind(v) : (v as any).mozCaptureStream?.bind(v);
      if (!capture) {
        alert('Your browser does not support video.captureStream(). Try Chrome or Firefox.');
        return false;
      }
      const stream: MediaStream = capture();
      attachStream(slot, stream, `Test Video: ${file.name}`);
      setCameraStatusMsg('');
      try {
        await v.play();
      } catch (e) {
        alert('Playback blocked by browser. Interact with the page and re-upload.');
        return false;
      }
      return true;
    } catch (err) {
      alert('Failed to load test video: ' + (err instanceof Error ? err.message : String(err)));
      return false;
    }
  }, [attachStream]);

  // Fire detection state
  const fireStateRef = useRef(createFireState());
  const [fireStatus, setFireStatus] = useState<{
    detected: boolean;
    fireDetected: boolean;
    smokeEmergency: boolean;
    confidence: number;
    smokeRatio: number;
    visibility: number;
    reason?: string;
  }>({
    detected: false,
    fireDetected: false,
    smokeEmergency: false,
    confidence: 0,
    smokeRatio: 0,
    visibility: 100,
  });

  // Facial distress (cam 2)
  const faceDistress = useFaceDistress(running);
  const yamnet = useYamnet(running);

  const alertCooldownRef = useRef<Record<string, number>>({});
  const snapshotCooldownRef = useRef(0);
  const [snapshots, setSnapshots] = useState<{ id: string; timestamp: Date; dataUrl: string; reason: string }[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<{ id: string; timestamp: Date; dataUrl: string; reason: string } | null>(null);
  const addAlert = useCallback((message: string, severity: Alert['severity'], cameraId: number, snapshotId?: string) => {
    const key = `${message}-${cameraId}`;
    const now = Date.now();
    if (alertCooldownRef.current[key] && now - alertCooldownRef.current[key] < 3000) return;
    alertCooldownRef.current[key] = now;

    setAlerts(prev => [{
      id: `${now}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date(),
      message,
      severity,
      cameraId,
      snapshotId,
    }, ...prev].slice(0, 200));
  }, []);

  const lastMatchedPhraseRef = useRef<string>('');
  const lastMatchedTimeRef = useRef<number>(0);

  // Low-latency wake word detection — checks both transcript and interim
  useEffect(() => {
    if (!running) return;
    const combinedText = `${transcript} ${interimTranscript}`.trim();
    if (!combinedText) return;
    
    const match = checkForWakeWord(combinedText);
    const now = Date.now();
    if (match.matched && (match.phrase !== lastMatchedPhraseRef.current || now - lastMatchedTimeRef.current > 5000)) {
      lastMatchedPhraseRef.current = match.phrase;
      lastMatchedTimeRef.current = now;
        addAlert(`Wake word: "${match.phrase}"`, match.isEmergency ? 'critical' : 'high', 0);
      logAlert('wake_word', `Wake word detected: "${match.phrase}"`);
      logNotification(match.wakeWordId, match.phrase, match.actionType, match.isEmergency);
      if (match.isEmergency) {
        setShowEmergency(true);
        logAlert('emergency_trigger', `Emergency phrase triggered: "${match.phrase}"`);
      }
    }
  }, [transcript, interimTranscript, running, checkForWakeWord, addAlert, logAlert, logNotification]);

  const handleStart = useCallback(async () => {
    const detected = await enumerateDevices();
    // Require a connected camera (webcam OR IP/CCTV) before enabling any
    // detection pipeline. Simulation mode bypasses the requirement.
    let hasCamera = simulationMode || ipCam.connected || !!pendingVideoRef.current;
    if (!simulationMode) {
      try {
        const started = await startCameras(quality);
        if (started.some(c => c.active)) hasCamera = true;
      } catch (err) {
        console.warn('[handleStart] Cameras failed to start:', err);
      }
    }
    if (!hasCamera) {
      const msg = (!detected || detected.length === 0) && !ipCam.connected
        ? 'No camera detected. Connect a webcam or CCTV/IP camera.'
        : 'No camera connected. Open Connect to choose a camera.';
      setCameraStatusMsg(msg);
      addAlert(msg, 'medium', 1);
      return;
    }
    // Start any pending uploaded test video only when monitoring begins
    if (pendingVideoRef.current) {
      await startPendingTestVideo();
    }
    loadModel(); // Start loading COCO-SSD model
    if (speechSupported) startSpeech();
    await startAudio().catch((err) => {
      console.warn('[handleStart] Audio failed to start:', err);
    });
    setCameraStatusMsg('');
    setRunning(true);
  }, [simulationMode, quality, startCameras, startAudio, enumerateDevices, loadModel, speechSupported, startSpeech, ipCam.connected, addAlert, startPendingTestVideo]);

  const handleStop = useCallback(() => {
    setRunning(false);
    stopCameras();
    stopAudio();
    stopSpeech();
    clearSpeech();
    setAttentionScore(0);
    setGlobalSaliencyScore(0);
  }, [stopCameras, stopAudio, stopSpeech, clearSpeech]);

  // Watch for camera disconnect mid-run: if no active webcam and no IP cam,
  // stop detection and surface a reconnect message in the existing feed area.
  useEffect(() => {
    if (!running) return;
    if (simulationMode) return;
    const anyActive = cameras.some(c => c.active) || ipCam.connected;
    if (!anyActive) {
      const more = devices.length > 0;
      const msg = more
        ? 'Camera disconnected. Open Connect to switch to another available camera.'
        : 'Camera disconnected. No other cameras detected — reconnect to continue.';
      setCameraStatusMsg(msg);
      addAlert(msg, 'high', 1);
      handleStop();
    }
  }, [running, simulationMode, cameras, ipCam.connected, handleStop, addAlert, devices.length]);

  // Listen for underlying MediaStreamTrack ended events (USB unplug, IP cam drop)
  useEffect(() => {
    const tracks: MediaStreamTrack[] = [];
    cameras.forEach(c => {
      if (c.stream) c.stream.getTracks().forEach(t => tracks.push(t));
    });
    if (ipCam.stream) ipCam.stream.getTracks().forEach(t => tracks.push(t));
    if (tracks.length === 0) return;
    const onEnded = () => {
      // Force a re-evaluation: mark camera inactive if its track ended.
      cameras.forEach(c => {
        if (c.stream && c.stream.getTracks().every(t => t.readyState === 'ended')) {
          updateCamera(c.id, { active: false, stream: null, fps: 0 });
        }
      });
    };
    tracks.forEach(t => t.addEventListener('ended', onEnded));
    return () => tracks.forEach(t => t.removeEventListener('ended', onEnded));
  }, [cameras, ipCam.stream, updateCamera]);

  // Speech recognition is always on when running — no toggle needed
  // It auto-starts in handleStart and auto-stops in handleStop

  const handleFpsUpdate = useCallback((cameraId: number, fps: number) => {
    updateCamera(cameraId, { fps });
  }, [updateCamera]);

  const handleObjectsUpdate = useCallback((cameraId: number, objects: DetectedObject[]) => {
    updateCamera(cameraId, { objects });
    objects.forEach(obj => {
      if (obj.label === 'person' && obj.confidence > 0.7) {
        addAlert('Person detected', 'medium', cameraId);
      }
      if (priorityObjects.includes(obj.label) && obj.label !== 'person') {
        addAlert(`Priority: ${obj.label} detected`, 'high', cameraId);
      }
    });
  }, [updateCamera, addAlert, priorityObjects]);

  const handleCameraSaliencyScore = useCallback((cameraId: number, score: number) => {
    updateCamera(cameraId, { saliencyScore: score });

    // The FUSED pipeline runs on CAM 2's frame if CAM 2 has its own source,
    // otherwise it falls back to CAM 1 (raw feed).
    const fusedCamId = cameras[1].active ? 2 : 1;

    // Update global saliency from the fused source only.
    if (cameraId === fusedCamId) {
      setGlobalSaliencyScore(score);
    }

    // Compute fused attention: α = 0.4×S + 0.3×A + 0.3×O — from fused source.
    if (cameraId === fusedCamId) {
      const saliencyComponent = score;
      const audioComponent = audioFeatures.speechDetected
        ? Math.min(100, Math.abs(audioFeatures.decibel) + 20)
        : Math.min(100, Math.max(0, (audioFeatures.decibel + 50) * 1.5));
      const fusedObjs = cameras[fusedCamId - 1].objects;
      const objectComponent = fusedObjs.length > 0
        ? Math.min(100, fusedObjs.reduce((sum, o) => sum + o.confidence * 100, 0) / fusedObjs.length)
        : 0;
      
      const fused = Math.min(100, Math.round(
        0.4 * saliencyComponent + 0.3 * audioComponent + 0.3 * objectComponent
      ));
      setAttentionScore(fused);
    }

    // Audio event classification alerts (only from the fused cam to avoid duplicates)
    if (cameraId === fusedCamId) {
      if (audioFeatures.audioEvent === 'clap') {
        addAlert('Clap detected', 'medium', 0);
      }
      if (audioFeatures.audioEvent === 'scream') {
        addAlert('Scream detected!', 'high', 0);
        logAlert('scream', 'Scream detected by audio analysis');
      }
      if (audioFeatures.audioEvent === 'bang') {
        addAlert('Bang/impact detected!', 'critical', 0);
        logAlert('bang', 'Bang/impact detected by audio analysis');
      }
      if (audioFeatures.speechDetected) {
        addAlert('Speech detected', 'low', 0);
      }
      if (audioFeatures.decibel > -10) {
        addAlert('High noise level', 'medium', 0);
      }
      if (audioFeatures.speechDetected && score > 50) {
        const now = Date.now();
        let snapId: string | undefined;
        if (now - snapshotCooldownRef.current > 5000 && sourceCanvas) {
          snapshotCooldownRef.current = now;
          try {
            const dataUrl = sourceCanvas.toDataURL('image/png');
            snapId = `snap-${now}`;
            const snap = {
              id: snapId,
              timestamp: new Date(),
              dataUrl,
              reason: 'Person + loud speech (HIGH ATTENTION)',
            };
            setSnapshots(prev => [snap, ...prev].slice(0, 50));
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `snapshot-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
            a.click();
            logAlert('high_attention', 'Person + loud speech = HIGH ATTENTION');
          } catch (err) {
            console.error('[AutoSnapshot] Failed:', err);
          }
        }
        addAlert('Person + loud speech = HIGH ATTENTION', 'critical', 1, snapId);
      }
    }
  }, [audioFeatures, addAlert, updateCamera, sourceCanvas, logAlert, wakeWords, cameras]);

  const handleSaliencyViewScore = useCallback((score: number) => {
    setGlobalSaliencyScore(score);
  }, []);

  const handleDetectFrame = useCallback(async (video: HTMLVideoElement): Promise<DetectedObject[]> => {
    return detect(video, priorityObjects, minConfidence / 100);
  }, [detect, priorityObjects, minConfidence]);

  const handleFrameCapture = useCallback((canvas: HTMLCanvasElement) => {
    setSourceCanvas(prev => prev === canvas ? prev : canvas);
  }, []);

  const handleCam2FrameCapture = useCallback((canvas: HTMLCanvasElement) => {
    setCam2SourceCanvas(prev => prev === canvas ? prev : canvas);
  }, []);

  // Attach IP camera stream into the chosen camera slot
  useEffect(() => {
    if (ipCam.stream && ipCam.connected) {
      attachStream(ipTargetSlot, ipCam.stream, `IP Cam (${ipKind.toUpperCase()})`);
    }
  }, [ipCam.stream, ipCam.connected, ipTargetSlot, ipKind, attachStream]);

  // Fire detection — runs on cam 1 source frames every ~500ms
  useEffect(() => {
    const target = cam2SourceCanvas || sourceCanvas;
    if (!running || !target) return;
    const fusedObjs = cameras[1].active ? cameras[1].objects : cameras[0].objects;
    const fireCooldown = { current: 0 };
    const interval = window.setInterval(() => {
      try {
        const ctx = target.getContext('2d');
        if (!ctx || target.width === 0 || target.height === 0) return;
        const frame = ctx.getImageData(0, 0, target.width, target.height);
        const result = detectFire(frame, fireStateRef.current, fusedObjs);
        setFireStatus({
          detected: result.detected,
          fireDetected: result.fireDetected,
          smokeEmergency: result.smokeEmergency,
          confidence: result.confidence,
          smokeRatio: result.smokeRatio,
          visibility: result.visibility,
          reason: result.rejectedReason,
        });
        if (result.detected && Date.now() - fireCooldown.current > 3000) {
          fireCooldown.current = Date.now();
          if (result.fireDetected) {
            addAlert(`Fire detected (${Math.round(result.confidence * 100)}% conf)`, 'critical', 1);
            logAlert('fire', `Fire signature confirmed (ratio ${result.firePixelRatio.toFixed(3)}, flicker ${result.flickerScore.toExponential(2)}, smoke ${(result.smokeRatio * 100).toFixed(1)}%, visibility ${result.visibility}/100)`);
            setShowEmergency(true);
          } else if (result.smokeEmergency) {
            addAlert(`Heavy smoke - visibility ${result.visibility}/100`, 'high', 1);
            logAlert('smoke', `Smoke emergency: coverage ${(result.smokeRatio * 100).toFixed(1)}%, visibility ${result.visibility}/100`);
          }
        }
      } catch (err) {
        // Canvas may be tainted by cross-origin IP cam — skip silently
      }
    }, 250);
    return () => window.clearInterval(interval);
  }, [running, sourceCanvas, cam2SourceCanvas, cameras, addAlert, logAlert]);

  // Facial distress — runs on cam 2 source (or cam 1 fallback) every ~700ms
  useEffect(() => {
    if (!running || !faceDistress.ready) return;
    const target = cam2SourceCanvas || sourceCanvas;
    if (!target) return;
    const lastAlertRef = { current: 0 };
    const interval = window.setInterval(() => {
      faceDistress.analyze(target);
    }, 350);
    return () => window.clearInterval(interval);
  }, [running, faceDistress.ready, faceDistress, cam2SourceCanvas, sourceCanvas]);

  // Alert on facial distress (mild + severe)
  useEffect(() => {
    if (!running) return;
    const lvl = faceDistress.distress.distressLevel;
    if (lvl === 'severe') {
      addAlert(`Facial distress: ${faceDistress.distress.expression} (${faceDistress.distress.distressScore}%)`, 'critical', 2);
      logAlert('facial_distress', `Severe facial distress: ${faceDistress.distress.expression}`);
      setShowEmergency(true);
    } else if (lvl === 'mild') {
      addAlert(`Possible distress: ${faceDistress.distress.expression} (${faceDistress.distress.distressScore}%)`, 'high', 2);
    }
  }, [faceDistress.distress.distressLevel, faceDistress.distress.expression, faceDistress.distress.distressScore, running, addAlert, logAlert]);

  // Alert on YAMNet audio distress (screams, crying, wails)
  useEffect(() => {
    if (!running) return;
    if (yamnet.distressScore >= 60) {
      addAlert(`Audio distress: ${yamnet.topLabel} (${yamnet.distressScore}%)`, 'critical', 0);
      logAlert('audio_distress', `YAMNet distress: ${yamnet.topLabel} (${yamnet.distressScore}%)`);
      setShowEmergency(true);
    } else if (yamnet.distressScore >= 35) {
      addAlert(`Elevated audio: ${yamnet.topLabel} (${yamnet.distressScore}%)`, 'high', 0);
    }
  }, [yamnet.distressScore, yamnet.topLabel, running, addAlert, logAlert]);

  const exportCSV = useCallback(() => {
    const rows = [
      ['Timestamp', 'Message', 'Severity', 'Camera'],
      ...alerts.map(a => [a.timestamp.toISOString(), a.message, a.severity, `CAM ${a.cameraId}`]),
    ];
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `saliency-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [alerts]);

  // Active camera count for layout
  const activeCameras = cameras.filter(c => c.active || (simulationMode && running));
  const maxSaliencyCamera = cameras.reduce((max, c) => c.saliencyScore > max.saliencyScore ? c : max, cameras[0]);

  // Emergency is now a floating overlay, not a full-screen takeover

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {/* IP Camera connect dialog */}
      {showIpDialog && (
        <div
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowIpDialog(false)}
        >
          <div
            className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Wifi className="w-4 h-4 text-primary" /> Connect CCTV / IP Camera
              </h3>
              <button onClick={() => setShowIpDialog(false)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Local webcams (built-in / USB) — auto-detected. Single-camera mode:
                all footage streams into CAM 2 for fused detection. */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-muted-foreground uppercase">
                Available cameras ({devices.length} found)
              </label>
              <p className="text-[10px] text-muted-foreground">
                Pick a camera to stream into CAM 2. All detection runs on this feed.
              </p>
              {devices.length === 0 ? (
                <p className="text-[10px] font-mono text-muted-foreground italic">
                  No built-in or USB webcam detected. Connect a CCTV/IP camera below, or grant camera permission and reload.
                </p>
              ) : (
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {devices.map((d, idx) => {
                    const inUse = cameras.some(c => c.deviceId === d.deviceId && c.active);
                    const lower = (d.label || '').toLowerCase();
                    const isVirtual = /obs|virtual|snap|manycam|streamlab/.test(lower);
                    const isBuiltIn = !isVirtual && (idx === 0 || /built[- ]?in|facetime|integrated|internal/.test(lower));
                    const kindTag = isBuiltIn ? 'Built-in' : isVirtual ? 'Virtual' : 'External';
                    return (
                      <button
                        key={d.deviceId || idx}
                        onClick={async () => {
                          const ok = await startSpecificCamera(d.deviceId, localTargetSlot, quality);
                          if (ok) {
                            setCameraStatusMsg('');
                            setShowIpDialog(false);
                          }
                        }}
                        className={`w-full text-left text-[10px] font-mono px-2 py-1.5 rounded border transition-all ${
                          inUse
                            ? 'bg-success/10 border-success/40 text-success'
                            : 'bg-secondary/30 border-border hover:border-primary/50 text-foreground/80'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate">
                            {inUse ? '● ' : '○ '}{d.label || `Camera ${idx + 1}`}
                          </span>
                          <span className={`text-[8px] px-1 py-0.5 rounded shrink-0 ${
                            isBuiltIn ? 'bg-primary/20 text-primary' :
                            isVirtual ? 'bg-accent/20 text-accent' :
                            'bg-muted text-muted-foreground'
                          }`}>{kindTag}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-[9px] font-mono text-muted-foreground italic">
                Tip: start OBS Virtual Camera in OBS, then it will appear here as a source you can assign to CAM 2 for fused detection.
              </p>
            </div>

            <div className="h-px bg-border" />

            {/* Upload video for testing detection */}
            <div className="space-y-2">
              <label className="text-[10px] font-mono text-muted-foreground uppercase">
                Upload test video (fire / smoke / distress clips)
              </label>
              <input
                type="file"
                accept="video/*"
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  pendingVideoRef.current = { file, slot: localTargetSlot };
                  setTestVideoName(file.name);
                  setShowIpDialog(false);
                }}
                className="w-full text-[10px] font-mono file:mr-2 file:py-1 file:px-2 file:rounded file:border file:border-input file:bg-secondary/30 file:text-foreground/80 file:cursor-pointer"
              />
              {testVideoName && (
                <p className="text-[9px] font-mono text-success">Ready: {testVideoName} — press Start Monitoring to play.</p>
              )}
              <p className="text-[9px] font-mono text-muted-foreground italic">
                The video is queued and only starts playing when you press Start Monitoring. Use it to validate fire / smoke / facial-distress logic without a live camera.
              </p>
            </div>

            <div className="h-px bg-border" />

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-muted-foreground uppercase">Stream type</label>
              <div className="grid grid-cols-3 gap-1">
                {(['hls', 'mjpeg', 'image'] as const).map(k => (
                  <button
                    key={k}
                    onClick={() => setIpKind(k)}
                    className={`text-[10px] font-mono py-1.5 rounded border transition-all ${
                      ipKind === k
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary/30 border-border text-foreground/70 hover:border-primary/50'
                    }`}
                  >
                    {k.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="text-[9px] font-mono text-muted-foreground italic">
                {ipKind === 'hls' && 'HLS .m3u8 — most modern IP cams via gateway/converter'}
                {ipKind === 'mjpeg' && 'MJPEG stream URL (e.g. /video, /mjpg/video.mjpg)'}
                {ipKind === 'image' && 'Snapshot URL polled at 10fps (e.g. /shot.jpg)'}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-mono text-muted-foreground uppercase">Camera URL</label>
              <input
                type="url"
                value={ipUrl}
                onChange={e => setIpUrl(e.target.value)}
                placeholder={ipKind === 'hls' ? 'https://example.com/stream.m3u8' : 'http://192.168.1.50/video'}
                className="w-full text-[11px] font-mono px-3 py-2 rounded border border-input bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <p className="text-[10px] text-muted-foreground">
              This IP camera will stream into CAM 2 and drive all detection.
            </p>

            {ipCam.error && (
              <div className="text-[10px] font-mono text-destructive bg-destructive/10 px-2 py-1 rounded">
                {ipCam.error}
              </div>
            )}
            <p className="text-[9px] font-mono text-muted-foreground">
              Browsers can't play raw RTSP. Use an HLS gateway (e.g. <code>go2rtc</code>, <code>MediaMTX</code>) or your camera's MJPEG snapshot URL. The URL must be served over HTTPS and allow CORS.
            </p>

            <div className="flex gap-2">
              <button
                onClick={() => setShowIpDialog(false)}
                className="flex-1 text-xs font-mono py-2 rounded border border-border hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!ipUrl.trim()) return;
                  const ok = await ipCam.connect({ url: ipUrl.trim(), kind: ipKind });
                  if (ok) setShowIpDialog(false);
                }}
                disabled={!ipUrl.trim()}
                className="flex-1 text-xs font-mono py-2 rounded bg-primary text-primary-foreground hover:bg-primary/80 transition-all disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Emergency Popup */}
      {showEmergency && (
        <div className="fixed bottom-4 right-4 z-50 w-80 bg-destructive/95 backdrop-blur-md text-destructive-foreground rounded-xl shadow-2xl border-2 border-destructive p-4 space-y-3 animate-in slide-in-from-bottom-5">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-mono font-bold">EMERGENCY DETECTED</h3>
          </div>
          <p className="text-xs font-mono opacity-90">
            An emergency wake word was triggered. Household members notified.
          </p>
          <a
            href="tel:911"
            className="block w-full py-2.5 px-4 bg-background text-destructive font-mono font-bold text-sm rounded-lg text-center hover:bg-background/90 transition-all"
          >
            CALL 911
          </a>
          <button
            onClick={() => setShowEmergency(false)}
            className="w-full text-[10px] font-mono opacity-70 hover:opacity-100 transition-opacity"
          >
            Dismiss (false alarm)
          </button>
        </div>
      )}
      {/* Header */}
      <header id="tour-header" className="border-b border-border bg-card/60 backdrop-blur-sm px-4 py-2.5 flex items-center justify-between">
        {/* Left: Brand */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-sm font-semibold text-foreground tracking-tight">
              MSDSystem
            </h1>
          </div>
        </div>

        {/* Center: Status */}
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
            running
              ? 'bg-success/10 text-success'
              : 'bg-muted text-muted-foreground'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${running ? 'bg-success animate-pulse' : 'bg-muted-foreground/50'}`} />
            {running ? 'Live' : 'Standby'}
          </div>
          {user && (
            <button
              onClick={() => navigate('/household')}
              className="flex items-center gap-1 text-[11px] font-medium text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-full transition-colors"
              title="Open Household"
            >
              <Home className="w-3 h-3" /> Household
            </button>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground mr-1">
            <Clock className="w-3 h-3" />
            <span className="font-mono">{new Date().toLocaleTimeString()}</span>
          </div>

          <button
            onClick={() => {
              document.documentElement.classList.toggle('dark');
              setDarkMode(prev => !prev);
            }}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            title={darkMode ? 'Light mode' : 'Dark mode'}
          >
            {darkMode ? <Sun className="w-4 h-4 text-warning" /> : <Moon className="w-4 h-4 text-muted-foreground" />}
          </button>

          <button
            onClick={() => setShowTutorial(true)}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
            title="Replay tutorial"
          >
            <HelpCircle className="w-4 h-4 text-muted-foreground" />
          </button>

          {user && (
            <>
              <div className="hidden sm:block h-4 w-px bg-border" />
              <span className="hidden sm:inline text-[11px] text-muted-foreground max-w-[140px] truncate">{user.email}</span>
              <button
                onClick={signOut}
                className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4 text-muted-foreground hover:text-destructive" />
              </button>
            </>
          )}
          {!user && !authLoading && (() => {
            const guest = sessionStorage.getItem('guest_member');
            if (guest) {
              const { name, household } = JSON.parse(guest);
              return (
                <span className="text-[11px] font-medium text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                  {name} • {household}
                </span>
              );
            }
            return (
              <button
                onClick={() => navigate('/auth')}
                className="flex items-center gap-1 text-[11px] font-medium text-primary hover:bg-primary/10 px-2.5 py-1 rounded-lg transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" /> Sign In
              </button>
            );
          })()}

          {/* Mobile hamburger to open sidebar drawer */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors"
            title="Open controls"
            aria-label="Open controls"
          >
            <Menu className="w-5 h-5 text-foreground" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-col lg:flex-row h-[calc(100vh-49px)]">
        {/* Left: Specialized camera grid + fusion */}
         <div className="flex-1 p-2 flex flex-col gap-2 overflow-y-auto">
          {/* Live camera view */}
          <div id="tour-cams">
            {/* CAM 1 kept hidden as the detection source pipeline */}
            <div className="hidden">
              <CameraFeed
                camera={cameras[0]}
                mirror={mirror}
                showBoundingBoxes={false}
                showHeatmap={false}
                heatmapOpacity={0}
                saliencyMode={saliencyMode}
                threshold={threshold}
                simulationMode={simulationMode && running}
                priorityObjects={priorityObjects}
                detectionStats={detectionStats}
                onFpsUpdate={handleFpsUpdate}
                onObjectsUpdate={handleObjectsUpdate}
                onSaliencyScoreUpdate={handleCameraSaliencyScore}
                onFrameCapture={handleFrameCapture}
                onDetectFrame={handleDetectFrame}
              />
            </div>

            {/* CAM view — fused detection is the only visible feed */}
            <FusedDetectionView
              sourceCanvas={cam2SourceCanvas || sourceCanvas}
              objects={cameras[1].active ? cameras[1].objects : cameras[0].objects}
              audioFeatures={audioFeatures}
              attentionScore={attentionScore}
              saliencyScore={globalSaliencyScore}
              active={running}
              transcript={transcript}
              interimTranscript={interimTranscript}
              speechListening={speechListening}
              onToggleSpeech={() => {}}
            />
          </div>

          {/* Hidden CAM 2 raw capture — only when cam 2 has its own stream */}
          {cameras[1].active && (
            <div className="hidden">
              <CameraFeed
                camera={cameras[1]}
                mirror={false}
                showBoundingBoxes={false}
                showHeatmap={false}
                heatmapOpacity={0}
                saliencyMode={saliencyMode}
                threshold={threshold}
                simulationMode={false}
                priorityObjects={priorityObjects}
                detectionStats={detectionStats}
                onFpsUpdate={handleFpsUpdate}
                onObjectsUpdate={handleObjectsUpdate}
                onSaliencyScoreUpdate={handleCameraSaliencyScore}
                onFrameCapture={handleCam2FrameCapture}
                onDetectFrame={handleDetectFrame}
              />
            </div>
          )}

          {/* IP / CCTV camera connect */}
          <div className="bg-card rounded-md border border-border panel-glow p-3 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-mono text-foreground flex-1">
              {ipCam.connected
                ? `IP Cam connected -> CAM ${ipTargetSlot}`
                : cameras.some(c => c.active)
                  ? `Webcam active -> ${cameras.find(c => c.active)?.label || 'CAM 1'}`
                  : devices.length > 0
                    ? `${devices.length} local camera(s) detected — click Connect to choose, or use a CCTV/IP URL`
                    : 'No camera detected — connect a CCTV / IP camera (HLS .m3u8 or MJPEG/snapshot URL)'}
            </span>
            {ipCam.connected ? (
              <button
                onClick={() => { ipCam.disconnect(); attachStream(ipTargetSlot, null); }}
                className="text-[10px] font-mono px-2 py-1 rounded bg-destructive/20 text-destructive hover:bg-destructive/30"
              >
                Disconnect
              </button>
            ) : (
              <button
                onClick={async () => {
                  setShowIpDialog(true);
                  // Prime camera permission so built-in / USB device labels
                  // become visible in the picker (browsers hide labels until
                  // permission is granted at least once).
                  try {
                    const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                    s.getTracks().forEach(t => t.stop());
                  } catch { /* user denied — enumeration still returns deviceIds */ }
                  enumerateDevices();
                }}
                className="text-[10px] font-mono px-2 py-1 rounded bg-primary/20 text-primary hover:bg-primary/30"
              >
                + Connect
              </button>
            )}
          </div>

          {/* Saliency-% breakdown — replaces the multimodal fusion output */}
          <div className="bg-card rounded-md border border-primary/30 panel-glow p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-primary uppercase tracking-wider">
                Saliency Score Calculation
              </span>
              <span className="text-[9px] font-mono text-muted-foreground">
                α = 0.40·S + 0.30·A + 0.30·O
              </span>
            </div>

            {(() => {
              const audioComponent = audioFeatures.speechDetected
                ? Math.min(100, Math.abs(audioFeatures.decibel) + 20)
                : Math.min(100, Math.max(0, (audioFeatures.decibel + 50) * 1.5));
              const activeObjs = cameras[1].active ? cameras[1].objects : cameras[0].objects;
              const objectComponent = activeObjs.length > 0
                ? Math.min(100, activeObjs.reduce((s, o) => s + o.confidence * 100, 0) / activeObjs.length)
                : 0;
              const sContrib = Math.round(0.4 * globalSaliencyScore);
              const aContrib = Math.round(0.3 * audioComponent);
              const oContrib = Math.round(0.3 * objectComponent);
              const rows: Array<{ label: string; value: number; weight: number; contrib: number; color: string; explain: string }> = [
                { label: 'Visual Saliency (S)', value: globalSaliencyScore, weight: 40, contrib: sContrib, color: 'bg-primary',     explain: 'Edge + motion energy from CAM 1 frame' },
                { label: 'Audio Energy (A)',    value: Math.round(audioComponent), weight: 30, contrib: aContrib, color: 'bg-warning',     explain: audioFeatures.speechDetected ? 'Speech + dB level' : 'Ambient dB level' },
                { label: 'Object Confidence (O)', value: Math.round(objectComponent), weight: 30, contrib: oContrib, color: 'bg-accent',    explain: `${activeObjs.length} object(s) avg confidence` },
              ];
              return (
                <div className="space-y-1.5">
                  {rows.map(r => (
                    <div key={r.label} className="space-y-0.5">
                      <div className="flex items-center justify-between text-[9px] font-mono">
                        <span className="text-foreground/80">{r.label} <span className="text-muted-foreground">× {r.weight}%</span></span>
                        <span className="text-foreground">
                          {r.value}% <span className="text-muted-foreground">→ +{r.contrib}</span>
                        </span>
                      </div>
                      <div className="h-1.5 bg-secondary/50 rounded overflow-hidden relative">
                        <div className={`h-full ${r.color} rounded transition-all`} style={{ width: `${r.value}%` }} />
                      </div>
                      <p className="text-[8px] font-mono text-muted-foreground italic">{r.explain}</p>
                    </div>
                  ))}
                  <div className="mt-2 flex items-center gap-3 bg-secondary/20 rounded p-2">
                    <span className="text-[9px] font-mono text-muted-foreground">FUSED α =</span>
                    <span className={`text-sm font-mono font-bold ${attentionScore > 70 ? 'text-destructive' : attentionScore > 40 ? 'text-warning' : 'text-success'}`}>
                      {attentionScore}%
                    </span>
                    <div className="flex-1 h-2 bg-secondary/50 rounded overflow-hidden">
                      <div className={`h-full rounded transition-all ${attentionScore > 70 ? 'bg-destructive' : attentionScore > 40 ? 'bg-warning' : 'bg-success'}`} style={{ width: `${attentionScore}%` }} />
                    </div>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${attentionScore > 70 ? 'bg-destructive/20 text-destructive' : attentionScore > 40 ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'}`}>
                      {attentionScore > 70 ? 'ALERT' : attentionScore > 40 ? 'ELEVATED' : 'NORMAL'}
                    </span>
                  </div>
                </div>
              );
            })()}

            {/* Fire + Face distress strip */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className={`rounded p-2 border ${fireStatus.detected ? 'border-destructive/60 bg-destructive/10' : 'border-border bg-secondary/20'}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <Flame className={`w-3 h-3 ${fireStatus.detected ? 'text-destructive animate-pulse' : 'text-muted-foreground'}`} />
                  <span className="text-[9px] font-mono text-foreground/80">
                    Fire {Math.round(fireStatus.confidence * 100)}% · Smoke {Math.round(fireStatus.smokeRatio * 100)}% · Vis {fireStatus.visibility}
                  </span>
                </div>
                <p className="text-[8px] font-mono text-muted-foreground italic">
                  {fireStatus.fireDetected
                    ? 'Real fire signature (color + flicker)'
                    : fireStatus.smokeEmergency
                      ? `Smoke emergency - visibility ${fireStatus.visibility}/100`
                      : fireStatus.reason || 'No fire signature'}
                </p>
                {fireStatus.detected && (
                  <DetectionFeedback
                    householdId={householdId}
                    eventType="fire"
                    confidence={fireStatus.confidence}
                    visualContext={{ reason: fireStatus.reason }}
                  />
                )}
              </div>
              <div className={`rounded p-2 border ${yamnet.distressScore >= 60 ? 'border-destructive/60 bg-destructive/10' : yamnet.distressScore >= 30 ? 'border-warning/60 bg-warning/10' : 'border-border bg-secondary/20'}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-mono text-foreground/80">
                    YAMNet Distress ({yamnet.distressScore}%)
                  </span>
                </div>
                <p className="text-[8px] font-mono text-muted-foreground italic">
                  {yamnet.error ? yamnet.error :
                   !yamnet.ready ? 'Loading AudioSet model…' :
                   `${yamnet.topLabel} (${Math.round(yamnet.topScore * 100)}%)`}
                </p>
              </div>
              <div className={`rounded p-2 border ${faceDistress.distress.distressLevel === 'severe' ? 'border-destructive/60 bg-destructive/10' : faceDistress.distress.distressLevel === 'mild' ? 'border-warning/60 bg-warning/10' : 'border-border bg-secondary/20'}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-mono text-foreground/80">
                    Facial Distress ({faceDistress.distress.distressScore}%)
                  </span>
                </div>
                <p className="text-[8px] font-mono text-muted-foreground italic">
                  {!faceDistress.ready ? 'Loading model…' :
                   faceDistress.error ? faceDistress.error :
                   !faceDistress.distress.hasFace ? 'No face detected' :
                   `${faceDistress.distress.expression} (${Math.round(faceDistress.distress.probability * 100)}%)`}
                </p>
                {faceDistress.distress.distressLevel !== 'none' && (
                  <DetectionFeedback
                    householdId={householdId}
                    eventType="facial_distress"
                    confidence={faceDistress.distress.probability}
                    audioEvent={audioFeatures.audioEvent}
                    visualContext={{
                      expression: faceDistress.distress.expression,
                      score: faceDistress.distress.distressScore,
                    }}
                  />
                )}
              </div>
            </div>

            {/* Model cache controls + stats */}
            <div className="mt-2">
              <ModelCachePanel />
            </div>
          </div>

          {/* Bottom: Timeline */}
          <div className="bg-card rounded-md border border-border panel-glow p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono text-primary uppercase tracking-wider">Timeline</span>
              <span className="text-[9px] font-mono text-muted-foreground">{alerts.length} events</span>
            </div>
            <div className="flex gap-0.5 overflow-x-auto pb-1 items-end h-8">
              {alerts.slice(0, 80).map(alert => {
                const hasSnap = alert.snapshotId || snapshots.some(s => Math.abs(s.timestamp.getTime() - alert.timestamp.getTime()) < 5000);
                return (
                  <div
                    key={alert.id}
                    onClick={() => {
                      const snap = alert.snapshotId
                        ? snapshots.find(s => s.id === alert.snapshotId)
                        : snapshots.find(s => Math.abs(s.timestamp.getTime() - alert.timestamp.getTime()) < 5000);
                      if (snap) setSelectedSnapshot(snap);
                    }}
                    className={`flex-shrink-0 w-1 rounded-t-full transition-all ${
                      hasSnap ? 'cursor-pointer hover:opacity-70 ring-1 ring-primary/50' : ''
                    } ${
                      alert.severity === 'critical' ? 'bg-destructive h-8' :
                      alert.severity === 'high' ? 'bg-destructive/60 h-6' :
                      alert.severity === 'medium' ? 'bg-warning h-4' :
                      'bg-primary/40 h-2'
                    }`}
                    title={`${alert.message} - ${alert.timestamp.toLocaleTimeString()}${hasSnap ? ' - Click to view' : ''}`}
                  />
                );
              })}
              {alerts.length === 0 && (
                <span className="text-[9px] font-mono text-muted-foreground">No events recorded</span>
              )}
            </div>
            {/* Selected snapshot viewer */}
            {selectedSnapshot && (
              <div className="mt-2 p-2 bg-secondary/50 rounded border border-primary/30 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-primary">
                    Playback — {selectedSnapshot.timestamp.toLocaleTimeString()}
                  </span>
                  <button
                    onClick={() => setSelectedSnapshot(null)}
                    className="text-[9px] font-mono text-muted-foreground hover:text-destructive"
                  >
                    Close
                  </button>
                </div>
                <img
                  src={selectedSnapshot.dataUrl}
                  alt={selectedSnapshot.reason}
                  className="w-full max-h-48 object-contain rounded border border-border"
                />
                <span className="text-[8px] font-mono text-destructive">{selectedSnapshot.reason}</span>
              </div>
            )}
          </div>
        </div>

        {/* Mobile backdrop */}
        {sidebarOpen && (
          <div
            className="lg:hidden fixed inset-0 z-40 bg-background/60 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Right sidebar — drawer on mobile, fixed panel on lg+ */}
        <div
          id="tour-sidebar"
          className={`${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} lg:translate-x-0 fixed lg:static right-0 top-0 lg:top-auto z-50 lg:z-auto h-full lg:h-auto w-72 max-w-[90vw] border-l border-border p-2 space-y-2 overflow-y-auto bg-card lg:bg-transparent transition-transform duration-200 ease-out`}
        >
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden w-full flex items-center justify-end p-1 text-muted-foreground hover:text-foreground"
            aria-label="Close controls"
          >
            <X className="w-4 h-4" />
          </button>
          {/* Start/Stop */}
          <div id="tour-start" className="bg-card rounded-md border border-border panel-glow p-3">
            <button
              onClick={running ? handleStop : handleStart}
              className={`w-full text-xs font-mono py-2.5 px-3 rounded-md transition-all font-semibold ${
                running
                  ? 'bg-destructive text-destructive-foreground hover:bg-destructive/80'
                  : 'bg-primary text-primary-foreground hover:bg-primary/80'
              }`}
            >
              {running ? '■ Stop Monitoring' : '▶ Start Monitoring'}
            </button>
            <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
              {running ? 'Live analysis is running.' : 'Press to start watching, listening, and detecting.'}
            </p>
          </div>

          <AttentionGauge score={attentionScore} />

          <AlertLog alerts={alerts} visible={showAlerts} snapshots={snapshots} />

          <ControlsPanel
            running={running}
            threshold={threshold}
            showBoundingBoxes={showBoundingBoxes}
            showHeatmap={showHeatmap}
            showAlerts={showAlerts}
            quality={quality}
            mirror={mirror}
            heatmapOpacity={heatmapOpacity}
            simulationMode={simulationMode}
            priorityObjects={priorityObjects}
            onStart={handleStart}
            onStop={handleStop}
            onThresholdChange={setThreshold}
            onToggleBoundingBoxes={() => setShowBoundingBoxes(p => !p)}
            onToggleHeatmap={() => setShowHeatmap(p => !p)}
            onToggleAlerts={() => setShowAlerts(p => !p)}
            onQualityChange={setQuality}
            onToggleMirror={() => setMirror(p => !p)}
            onHeatmapOpacityChange={setHeatmapOpacity}
            onToggleSimulation={() => setSimulationMode(p => !p)}
            onPriorityObjectsChange={setPriorityObjects}
            minConfidence={minConfidence}
            onMinConfidenceChange={setMinConfidence}
            onExportCSV={exportCSV}
          />


          {/* Auto-Snapshots */}
          {snapshots.length > 0 && (
            <div className="bg-card rounded-md border border-border panel-glow p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-primary uppercase tracking-wider">
                  Auto-Snapshots ({snapshots.length})
                </span>
                <button
                  onClick={() => setSnapshots([])}
                  className="text-[9px] font-mono text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {snapshots.slice(0, 10).map(snap => (
                  <div key={snap.id} className="space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-muted-foreground">
                        {snap.timestamp.toLocaleTimeString()}
                      </span>
                      <a
                        href={snap.dataUrl}
                        download={`snapshot-${snap.id}.png`}
                        className="text-[9px] font-mono text-primary hover:underline"
                      >
                        ↓ Save
                      </a>
                    </div>
                    <img
                      src={snap.dataUrl}
                      alt={snap.reason}
                      className="w-full rounded border border-border"
                    />
                    <span className="text-[8px] font-mono text-destructive">{snap.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <TutorialOverlay
        steps={tutorialSteps}
        open={showTutorial}
        onClose={() => setShowTutorial(false)}
        onFinish={() => {
          const key = user ? `msds-tutorial-done-${user.id}` : 'msds-tutorial-done-guest';
          try { localStorage.setItem(key, '1'); } catch { /* noop */ }
        }}
      />
    </div>
  );
}
