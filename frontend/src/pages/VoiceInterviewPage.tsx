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
  const effectiveSkillId = presetVoiceConfig?.skillId ?? urlSkillId ?? 'java-backend';

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

  // WebRTC 通话相关 refs
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioSenderRef = useRef<RTCRtpSender | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoStartRef = useRef(false);
  const endedByUserRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const configRef = useRef<{ model: string; voice: string; instructions: string }>({
    model: '',
    voice: 'Tina',
    instructions: '',
  });

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
    try { dcRef.current?.close(); } catch {}
    dcRef.current = null;
    try { pcRef.current?.close(); } catch {}
    pcRef.current = null;
    audioSenderRef.current = null;
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      try { remoteAudioRef.current.pause(); } catch {}
      remoteAudioRef.current.srcObject = null;
    }
  }, []);

  const commitUserMessage = useCallback((text: string) => {
    const normalized = (text || '').trim();
    if (!normalized) return;
    setMessages((prev) => [
      ...prev,
      { role: 'user', text: normalized, id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    ]);
    const id = sessionIdRef.current;
    if (id) voiceInterviewApi.appendMessage(id, { messageType: 'USER', userText: normalized }).catch(() => {});
  }, []);

  const commitAiMessage = useCallback((text: string) => {
    const normalized = (text || '').trim();
    if (!normalized) return;
    setMessages((prev) => [
      ...prev,
      { role: 'ai', text: normalized, id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` },
    ]);
    const id = sessionIdRef.current;
    if (id) voiceInterviewApi.appendMessage(id, { messageType: 'AI', aiText: normalized }).catch(() => {});
  }, []);

  const normalizeSdp = (sdp: string) => {
    let s = String(sdp).trim().replace(/\r?\n/g, '\r\n');
    if (!s.endsWith('\r\n')) s += '\r\n';
    return s;
  };

  const sendSessionUpdate = useCallback(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    const { voice, instructions } = configRef.current;
    dc.send(JSON.stringify({
      event_id: `event_${Date.now()}`,
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        voice,
        instructions,
        enable_input_audio_transcription: true,
        input_audio_transcription_model: 'qwen3-asr-flash-realtime',
        input_audio_transcription: { model: 'qwen3-asr-flash-realtime' },
        turn_detection: { type: 'semantic_vad', threshold: 0.5, silence_duration_ms: 800 },
      },
    }));
  }, []);

  const triggerOpening = useCallback(() => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify({ event_id: `event_${Date.now()}`, type: 'response.create' }));
  }, []);

  const handleDcMessage = useCallback((raw: string) => {
    let obj: any;
    try { obj = JSON.parse(raw); } catch { return; }
    const type: string | undefined = obj?.type;
    switch (type) {
      case 'session.created': {
        const track = localStreamRef.current?.getAudioTracks()[0];
        const sender = audioSenderRef.current;
        if (sender && track) {
          sender.replaceTrack(track).catch(() => {});
        }
        sendSessionUpdate();
        break;
      }
      case 'session.updated':
        triggerOpening();
        break;
      case 'conversation.item.input_audio_transcription.delta':
        setUserText((obj.text || '') + (obj.stash || ''));
        break;
      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = (obj.transcript || '').trim();
        if (transcript) {
          setUserText(transcript);
          commitUserMessage(transcript);
        }
        break;
      }
      case 'response.created':
        setIsAiSpeaking(true);
        setAiText('');
        break;
      case 'response.audio_transcript.delta':
        setAiText((prev) => prev + (obj.delta || ''));
        break;
      case 'response.audio_transcript.done': {
        const transcript = (obj.transcript || '').trim();
        setIsAiSpeaking(false);
        if (transcript) {
          setAiText(transcript);
          commitAiMessage(transcript);
        }
        setUserText('');
        break;
      }
      case 'input_audio_buffer.speech_started':
        setIsAiSpeaking(false);
        break;
      case 'error': {
        const err = obj?.error;
        setError(err?.message || err?.code || '通话出错');
        break;
      }
      default:
        break;
    }
  }, [commitAiMessage, commitUserMessage, sendSessionUpdate, triggerOpening]);

  const establishWebRtc = useCallback(async (sid: number) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    localStreamRef.current = stream;

    const pc = new RTCPeerConnection({ iceServers: [] });
    pcRef.current = pc;
    const audioTrack = stream.getAudioTracks()[0];
    if (!audioTrack) throw new Error('未检测到可用的麦克风音轨');
    audioSenderRef.current = pc.addTrack(audioTrack, stream);

    const dc = pc.createDataChannel('oai-events');
    dcRef.current = dc;
    dc.onmessage = (e) => handleDcMessage(e.data);

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0];
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = remoteStream;
        remoteAudioRef.current.play().catch(() => {});
      }
    };

    pc.onconnectionstatechange = () => {
      if (!pcRef.current) return;
      const state = pc.connectionState;
      if (state === 'connected') {
        setCallStatus('in-call');
        startTimer();
      } else if (state === 'failed' || state === 'closed' || state === 'disconnected') {
        if (!endedByUserRef.current) {
          setCallStatus('ended');
          setError('通话连接已断开');
        }
      }
    };

    // 门控：收到 session.created 前阻断音频发送
    const sender = audioSenderRef.current;
    if (sender) await sender.replaceTrack(null);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await new Promise<void>((resolve) => {
      if (pc.iceGatheringState === 'complete') resolve();
      else pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') resolve(); };
    });
    const offerSdp = pc.localDescription?.sdp;
    if (!offerSdp) throw new Error('无法生成 Offer SDP');

    const exchange = await voiceInterviewApi.exchangeSdp(sid, offerSdp);
    configRef.current = {
      model: exchange.model,
      voice: exchange.voice,
      instructions: exchange.instructions,
    };
    await pc.setRemoteDescription({ type: 'answer', sdp: normalizeSdp(exchange.answerSdp) });
  }, [handleDcMessage, startTimer]);

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
      await establishWebRtc(session.sessionId);
    } catch (err) {
      console.error('[WebRTC] startCall failed:', err);
      setError(err instanceof Error ? err.message : '建立通话失败，请重试');
      setCallStatus('ended');
    }
  }, [establishWebRtc]);

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
      await establishWebRtc(session.sessionId);
    } catch (err) {
      console.error('[WebRTC] resumeCall failed:', err);
      setError(err instanceof Error ? err.message : '恢复通话失败，请重试');
      setCallStatus('ended');
    }
  }, [establishWebRtc]);

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

      <audio ref={remoteAudioRef} autoPlay playsInline className="hidden" />
    </div>
  );
}
