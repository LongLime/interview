import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Clock, PhoneOff, AlertCircle, Bot, Mic, MicOff, ArrowLeft, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import InterviewPageHeader from '../components/InterviewPageHeader';
import RealtimeSubtitle from '../components/RealtimeSubtitle';
import { skillApi, type SkillDTO } from '../api/skill';
import { getTemplateName } from '../utils/voiceInterview';
import { voiceInterviewApi } from '../api/voiceInterview';

type VoiceConfig = {
  skillId: string;
  difficulty?: string;
  techEnabled: boolean;
  projectEnabled: boolean;
  hrEnabled: boolean;
  plannedDuration: number;
  resumeId?: number;
  llmProvider?: string;
};

type BrowserRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: any) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type BrowserRecognitionConstructor = new () => BrowserRecognition;

export default function VoiceInterviewPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const entryState = (location.state as {
    voiceConfig?: VoiceConfig;
    voiceSessionId?: number;
  } | null) || {};
  const resumeSessionId = entryState.voiceSessionId;
  const queryParams = new URLSearchParams(location.search);
  const urlSkillId = queryParams.get('skillId') || undefined;
  const urlDifficulty = queryParams.get('difficulty') || undefined;
  const urlDuration = Number(queryParams.get('duration') || queryParams.get('plannedDuration'));
  const queryVoiceConfig: VoiceConfig | undefined = urlSkillId
    ? {
        skillId: urlSkillId,
        difficulty: urlDifficulty,
        techEnabled: true,
        projectEnabled: true,
        hrEnabled: true,
        plannedDuration: Number.isFinite(urlDuration) && urlDuration > 0 ? urlDuration : 15,
      }
    : undefined;
  const presetVoiceConfig = entryState.voiceConfig ?? queryVoiceConfig;
  const effectiveSkillId = presetVoiceConfig?.skillId ?? urlSkillId ?? 'java';

  const [callStatus, setCallStatus] = useState<'idle' | 'connecting' | 'in-call' | 'ended'>('idle');
  const [currentTime, setCurrentTime] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('INTRO');
  const [userText, setUserText] = useState('');
  const [aiText, setAiText] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'ai'; text: string; id: string }[]>([]);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [templateName, setTemplateName] = useState<string>('');
  const [skills, setSkills] = useState<SkillDTO[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartRef = useRef(false);
  const endedByUserRef = useRef(false);
  const terminalErrorRef = useRef(false);
  const browserRecognitionRef = useRef<BrowserRecognition | null>(null);
  const browserVoiceModeRef = useRef(false);
  const browserRecognitionPausedRef = useRef(false);
  const lastBrowserSubmitRef = useRef({ text: '', at: 0 });
  const audioQueueRef = useRef<string[]>([]);
  const audioPlayingRef = useRef(false);
  const currentAudioRef = useRef<{ audio: HTMLAudioElement; sourceUrl: string } | null>(null);
  const awaitingAiReplyRef = useRef(false);
  const lastSubmittedTextRef = useRef('');
  const sessionIdRef = useRef<number | null>(null);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => setCurrentTime((prev) => prev + 1), 1000);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getPhaseLabel = (phase: string) => {
    const phaseMap: Record<string, string> = {
      INTRO: '自我介绍',
      TECH: '技术问题',
      PROJECT: '项目深挖',
      HR: 'HR问题',
    };
    return phaseMap[phase] || phase;
  };

  const teardownCall = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try { wsRef.current?.close(); } catch {}
    wsRef.current = null;
    browserVoiceModeRef.current = false;
    browserRecognitionPausedRef.current = false;
    lastBrowserSubmitRef.current = { text: '', at: 0 };
    audioQueueRef.current = [];
    audioPlayingRef.current = false;
    if (currentAudioRef.current) {
      currentAudioRef.current.audio.onended = null;
      currentAudioRef.current.audio.onerror = null;
      currentAudioRef.current.audio.pause();
      URL.revokeObjectURL(currentAudioRef.current.sourceUrl);
      currentAudioRef.current = null;
    }
    awaitingAiReplyRef.current = false;
    lastSubmittedTextRef.current = '';
    try { browserRecognitionRef.current?.stop(); } catch {}
    browserRecognitionRef.current = null;
    try { audioProcessorRef.current?.disconnect(); } catch {}
    audioProcessorRef.current = null;
    try { audioContextRef.current?.close(); } catch {}
    audioContextRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
  }, []);

  const commitUserMessage = useCallback((text: string) => {
    const normalized = (text || '').trim();
    if (!normalized) return;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: normalized, id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    ]);
  }, []);

  const commitAiMessage = useCallback((text: string) => {
    const normalized = (text || '').trim();
    if (!normalized) return;
    setMessages((prev) => [
      ...prev,
      { role: 'ai', text: normalized, id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    ]);
  }, []);

  const sendUserText = useCallback((text: string) => {
    const normalized = text.trim();
    if (!normalized) return;
    if (awaitingAiReplyRef.current || lastSubmittedTextRef.current === normalized) return;
    awaitingAiReplyRef.current = true;
    lastSubmittedTextRef.current = normalized;
    commitUserMessage(normalized);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'control',
        action: 'submit',
        data: { text: normalized },
      }));
    } else {
      awaitingAiReplyRef.current = false;
    }
  }, [commitUserMessage]);

  const speakBrowserText = useCallback((text: string) => {
    if (!browserVoiceModeRef.current || !('speechSynthesis' in window)) return;
    browserRecognitionPausedRef.current = true;
    try { browserRecognitionRef.current?.stop(); } catch {}
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.onstart = () => setIsAiSpeaking(true);
    utterance.onend = () => {
      setIsAiSpeaking(false);
      browserRecognitionPausedRef.current = false;
      try { browserRecognitionRef.current?.start(); } catch {}
    };
    window.speechSynthesis.speak(utterance);
  }, []);

  const startBrowserVoiceMode = useCallback(() => {
    const browserWindow = window as Window & {
      SpeechRecognition?: BrowserRecognitionConstructor;
      webkitSpeechRecognition?: BrowserRecognitionConstructor;
    };
    const Recognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError('当前浏览器不支持语音识别，请使用 Chrome 或 Edge');
      return;
    }
    browserVoiceModeRef.current = true;
    browserRecognitionPausedRef.current = false;
    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onresult = (event) => {
      let interimText = '';
      let finalText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript || '';
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      if (interimText) setUserText(interimText);
      if (finalText.trim()) {
        const normalizedFinalText = finalText.trim();
        const now = Date.now();
        const lastSubmit = lastBrowserSubmitRef.current;
        if (lastSubmit.text === normalizedFinalText && now - lastSubmit.at < 1500) return;
        lastBrowserSubmitRef.current = { text: normalizedFinalText, at: now };
        setUserText(normalizedFinalText);
        sendUserText(normalizedFinalText);
      }
    };
    recognition.onerror = () => setError('浏览器语音识别暂时中断，请继续说话');
    recognition.onend = () => {
      if (browserVoiceModeRef.current && !browserRecognitionPausedRef.current) {
        try { recognition.start(); } catch {}
      }
    };
    browserRecognitionRef.current = recognition;
    try { recognition.start(); } catch { setError('无法启动浏览器语音识别'); }
  }, [sendUserText]);

  const decodeBase64 = (value: string) => {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  };

  const playAudio = useCallback((value: string) => {
    audioQueueRef.current.push(value);
    if (audioPlayingRef.current) return;

    const playNext = () => {
      const next = audioQueueRef.current.shift();
      if (!next) {
        audioPlayingRef.current = false;
        setIsAiSpeaking(false);
        return;
      }
      audioPlayingRef.current = true;
      setIsAiSpeaking(true);
      const sourceUrl = URL.createObjectURL(new Blob([decodeBase64(next)], { type: 'audio/wav' }));
      const audio = new Audio(sourceUrl);
      currentAudioRef.current = { audio, sourceUrl };
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        URL.revokeObjectURL(sourceUrl);
        if (currentAudioRef.current?.audio === audio) currentAudioRef.current = null;
        playNext();
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.play().catch(finish);
    };

    playNext();
  }, []);

  const handleSocketMessage = useCallback((raw: string) => {
    let obj: any;
    try { obj = JSON.parse(raw); } catch { return; }
    const type: string | undefined = obj?.type;
    switch (type) {
      case 'control':
        if (obj.action === 'asr_ready') {
          setCallStatus('in-call');
          startTimer();
        }
        if (obj.action === 'voice_unavailable') {
          setError(null);
          setCallStatus('in-call');
          startTimer();
          startBrowserVoiceMode();
        }
        break;
      case 'subtitle':
        setUserText((prev) => obj.isFinal ? (obj.text || '') : prev + (obj.text || ''));
        if (obj.isFinal && obj.text?.trim()) {
          sendUserText(obj.text);
        }
        break;
      case 'text':
        setIsAiSpeaking(true);
        setAiText((prev) => obj.final ? (obj.content || '') : prev + (obj.content || ''));
        if (obj.final && obj.content?.trim()) {
          awaitingAiReplyRef.current = false;
          setIsAiSpeaking(false);
          commitAiMessage(obj.content);
          speakBrowserText(obj.content);
          setUserText('');
        }
        break;
      case 'audio':
        if (obj.data) playAudio(obj.data);
        break;
      case 'error': {
        awaitingAiReplyRef.current = false;
        const message = obj.message || obj.error?.message || '通话出错';
        if (!message.includes('实时语音识别')) setError(message);
        break;
      }
      default:
        break;
    }
  }, [commitAiMessage, playAudio, sendUserText, speakBrowserText, startBrowserVoiceMode, startTimer, teardownCall]);

  const establishWebSocket = useCallback(async (sid: number) => {
    terminalErrorRef.current = false;
    const session = await voiceInterviewApi.getSession(sid);
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    localStreamRef.current = stream;
    const websocketUrl = session.webSocketUrl.replace(/^http/, 'ws');
    const ws = new WebSocket(websocketUrl);
    wsRef.current = ws;
    await new Promise<void>((resolve, reject) => {
      const handleOpen = () => resolve();
      const handleError = () => reject(new Error('无法建立语音连接'));
      ws.addEventListener('open', handleOpen, { once: true });
      ws.addEventListener('error', handleError, { once: true });
    });
    ws.onmessage = (event) => handleSocketMessage(event.data);
    ws.onerror = () => setError('语音连接失败，请检查后端和业务空间配置');
    ws.onclose = () => {
      if (!endedByUserRef.current && !terminalErrorRef.current) {
        teardownCall();
        setCallStatus('ended');
        setError('语音连接已断开');
      }
    };

    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const mute = audioContext.createGain();
    mute.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const samples = event.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(samples.length);
      for (let index = 0; index < samples.length; index += 1) {
        const sample = Math.max(-1, Math.min(1, samples[index]));
        pcm[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      const bytes = new Uint8Array(pcm.buffer);
      let binary = '';
      for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
      ws.send(JSON.stringify({ type: 'audio', data: btoa(binary) }));
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(audioContext.destination);
    audioContextRef.current = audioContext;
    audioProcessorRef.current = processor;
  }, [handleSocketMessage, teardownCall]);

  const startCall = useCallback(async (config: VoiceConfig) => {
    setError(null);
    setCallStatus('connecting');
    try {
      const session = await voiceInterviewApi.createSession({
        skillId: config.skillId,
        difficulty: config.difficulty,
        introEnabled: true,
        techEnabled: config.techEnabled,
        projectEnabled: config.projectEnabled,
        hrEnabled: config.hrEnabled,
        plannedDuration: config.plannedDuration,
        resumeId: config.resumeId,
        llmProvider: config.llmProvider,
      });
      setSessionId(session.sessionId);
      setCurrentPhase(session.currentPhase);
      await establishWebSocket(session.sessionId);
    } catch (err) {
      console.error('[WebRTC] startCall failed:', err);
      teardownCall();
      setError(err instanceof Error ? err.message : '建立通话失败，请重试');
      setCallStatus('ended');
    }
  }, [establishWebSocket]);

  const resumeCall = useCallback(async (id: number) => {
    setError(null);
    setCallStatus('connecting');
    try {
      const [session, history] = await Promise.all([
        voiceInterviewApi.resumeSession(id),
        voiceInterviewApi.getMessages(id),
      ]);
      setSessionId(session.sessionId);
      setCurrentPhase(session.currentPhase);
      if (session.startTime) {
        const elapsed = Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000);
        setCurrentTime(elapsed > 0 ? elapsed : 0);
      }
      const restored: { role: 'user' | 'ai'; text: string; id: string }[] = [];
      for (const msg of history) {
        const ai = msg.aiGeneratedText?.trim();
        const user = msg.userRecognizedText?.trim();
        if (ai) restored.push({ role: 'ai', text: ai, id: `ai-${msg.id}` });
        if (user) restored.push({ role: 'user', text: user, id: `user-${msg.id}` });
      }
      setMessages(restored);
      await establishWebSocket(session.sessionId);
    } catch (err) {
      console.error('[WebRTC] resumeCall failed:', err);
      teardownCall();
      setError(err instanceof Error ? err.message : '恢复通话失败，请重试');
      setCallStatus('ended');
    }
  }, [establishWebSocket, teardownCall]);

  // 技能加载 + 模板名
  useEffect(() => {
    skillApi.listSkills().then(setSkills).catch(console.error);
  }, []);
  useEffect(() => {
    if (skills.length > 0 && effectiveSkillId) {
      setTemplateName(getTemplateName(effectiveSkillId, skills));
    }
  }, [skills, effectiveSkillId]);

  // 卸载清理
  useEffect(() => {
    return () => {
      teardownCall();
      const id = sessionIdRef.current;
      if (id && !endedByUserRef.current) {
        voiceInterviewApi.pauseSession(id).catch(() => {});
      }
    };
  }, [teardownCall]);

  // 自动开始
  useEffect(() => {
    if (autoStartRef.current) return;
    if (presetVoiceConfig) {
      autoStartRef.current = true;
      startCall(presetVoiceConfig);
    } else if (resumeSessionId) {
      autoStartRef.current = true;
      resumeCall(resumeSessionId);
    }
  }, [presetVoiceConfig, resumeSessionId, startCall, resumeCall]);

  const handleEndInterview = async () => {
    endedByUserRef.current = true;
    teardownCall();
    const id = sessionIdRef.current;
    if (id) {
      try { await voiceInterviewApi.endSession(id); } catch {}
    }
    navigate('/interviews');
  };

  const handleCloseModal = () => {
    navigate('/history');
  };

  const handleMuteToggle = () => {
    const nextMuted = !isMuted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setIsMuted(nextMuted);
  };

  const handlePause = async () => {
    const id = sessionIdRef.current;
    if (!id) return;
    endedByUserRef.current = true;
    teardownCall();
    try {
      await voiceInterviewApi.pauseSession(id);
      navigate('/interviews');
    } catch (err) {
      endedByUserRef.current = false;
      setError(err instanceof Error ? err.message : '暂停失败，请重试');
    }
  };

  const statusLabel = callStatus === 'in-call'
    ? isMuted ? '麦克风已静音' : isAiSpeaking ? '面试官正在说话' : '正在聆听'
    : callStatus === 'connecting' ? '正在接通面试官' : '通话已结束';

  if (!autoStartRef.current && !presetVoiceConfig && !resumeSessionId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="bg-surface rounded-xl border border-outline-variant shadow-sm p-8 text-center max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <p className="text-on-surface-variant text-lg font-semibold mb-2">未检测到语音面试配置</p>
          <p className="text-on-surface-variant text-sm mb-6">请从面试记录或"语音面试"入口开始</p>
          <button
            onClick={handleCloseModal}
            className="px-6 py-2 bg-primary-container text-on-primary rounded-lg hover:bg-primary-container transition-colors"
          >
            返回重新开始
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <div className="max-w-7xl mx-auto">
        <InterviewPageHeader
          title="语音模拟面试"
          subtitle="实时语音对话，面试官会根据你的回答持续追问"
          icon={<Mic className="w-6 h-6 text-white" />}
        />

        {error && (
          <div className="mb-6 bg-error-container/50 text-error rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <div className="xl:col-span-2 space-y-6">
            <div className="bg-surface rounded-xl border border-outline-variant shadow-sm p-6">
              <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => navigate('/interviews')}
                    className="w-9 h-9 rounded-lg bg-surface-container-high text-on-surface-variant hover:bg-surface-container transition-colors flex items-center justify-center"
                    title="返回面试记录"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div>
                    <h2 className="text-lg font-semibold text-on-surface">{templateName || effectiveSkillId}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs px-2 py-0.5 bg-primary-100 dark:bg-primary-900/40 text-primary rounded-full">
                        {getPhaseLabel(currentPhase)}
                      </span>
                      <span className="text-xs text-on-surface-variant">
                        {statusLabel}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-high text-on-surface-variant">
                  <Clock className="w-4 h-4" />
                  <span className="font-mono text-sm tabular-nums">{formatTime(currentTime)}</span>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center py-6">
                <motion.div
                  animate={isAiSpeaking ? { scale: [1, 1.05, 1] } : {}}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className={`w-32 h-32 rounded-full border-4 flex items-center justify-center mb-6 transition-colors
                    ${isAiSpeaking
                      ? 'border-primary-container bg-primary-container/20'
                      : 'border-outline-variant bg-surface-container-lowest'
                    }`}
                >
                  <Bot className={`w-14 h-14 ${isAiSpeaking ? 'text-primary-container' : 'text-outline'}`} />
                </motion.div>

                <div className="w-full max-w-2xl min-h-[130px] rounded-xl bg-surface-container-lowest border border-outline-variant px-6 py-5 text-center flex items-center justify-center">
                  <AnimatePresence mode="wait">
                    {isAiSpeaking || aiText ? (
                      <motion.p
                        key="ai-active"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-lg md:text-xl font-medium text-on-surface leading-relaxed"
                      >
                        {aiText || '思考中...'}
                      </motion.p>
                    ) : userText ? (
                      <motion.p
                        key="user-active"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="text-lg md:text-xl font-medium text-primary italic leading-relaxed"
                      >
                        {userText}
                      </motion.p>
                    ) : (
                      <motion.p
                        key="idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-on-surface-variant"
                      >
                        {callStatus === 'connecting' ? '正在建立安全语音通话...' : statusLabel}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            <div className="bg-surface rounded-xl border border-outline-variant shadow-sm p-5">
              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={handlePause}
                  disabled={callStatus !== 'in-call'}
                  className="w-12 h-12 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-50 flex items-center justify-center"
                  title="暂停"
                >
                  <Pause className="w-5 h-5" />
                </button>

                <button
                  onClick={handleMuteToggle}
                  disabled={callStatus !== 'in-call'}
                  className={`w-14 h-14 rounded-full transition-colors disabled:opacity-50 flex items-center justify-center ${
                    isMuted ? 'bg-red-50 text-red-600' : 'bg-primary-container text-on-primary'
                  }`}
                  title={isMuted ? '取消静音' : '静音'}
                >
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>

                <button
                  onClick={handleEndInterview}
                  disabled={!sessionId || callStatus === 'ended'}
                  className="w-14 h-14 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center"
                  title="结束面试"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
              </div>
              <p className="text-center text-xs text-on-surface-variant mt-3">
                {callStatus === 'in-call' ? '直接说话即可，停顿后面试官会自然接话' : statusLabel}
              </p>
            </div>
          </div>

          <div className="h-[520px] md:h-[560px] xl:h-[calc(100vh-240px)] xl:max-h-[760px] bg-surface rounded-xl border border-outline-variant shadow-sm overflow-hidden">
            <RealtimeSubtitle
              messages={messages}
              userText={userText}
              aiText={aiText}
              isAiSpeaking={isAiSpeaking}
            />
          </div>
        </div>
      </div>

    </div>
  );
}
