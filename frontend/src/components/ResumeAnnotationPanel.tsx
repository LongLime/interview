import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { gradeFromScore } from '../utils/score';

interface AnnotationSuggestion {
  category?: string;
  priority?: string;
  issue?: string;
  problem?: string;
  recommendation?: string;
  suggested_text?: string;
  suggestedText?: string;
  resume_text?: string;
  resumeText?: string;
  score_impact?: number;
  scoreImpact?: number;
  dimension?: string;
  effort?: string;
  color?: string;
  source?: 'resume' | 'jd';
}

interface ResumeAnnotationPanelProps {
  resumeText: string;
  analysis: any;
  onExport: () => void;
  exporting: boolean;
  onReanalyze?: () => void;
  reanalyzing?: boolean;
}

type AnalysisTab = 'resume' | 'jd';
type EditMode = 'delete' | 'insert' | 'change';

const dimensionLabels: Record<string, string> = {
  contentScore: '完整性',
  structureScore: '清晰度',
  skillMatchScore: '说服力',
  expressionScore: '专业性',
  completeness: '完整性',
  clarity: '清晰度',
  persuasiveness: '说服力',
  professionalism: '专业性',
};

function getMode(suggestion: AnnotationSuggestion): EditMode {
  if (suggestion.color === 'green') return 'insert';
  if (suggestion.color === 'red') return 'delete';
  if (suggestion.color === 'blue') return 'change';
  if ((suggestion.resume_text || suggestion.resumeText) && (suggestion.suggested_text || suggestion.suggestedText)) return 'change';
  if (suggestion.suggested_text || suggestion.suggestedText) return 'insert';
  return 'delete';
}

function findRange(text: string, snippet?: string): [number, number] | null {
  const value = snippet?.trim();
  if (!value) return null;
  const exact = text.toLocaleLowerCase().indexOf(value.toLocaleLowerCase());
  if (exact >= 0) return [exact, exact + value.length];
  const compactText = text.replace(/\s+/g, '').toLocaleLowerCase();
  const compactValue = value.replace(/\s+/g, '').toLocaleLowerCase();
  const compactIndex = compactText.indexOf(compactValue);
  if (compactIndex < 0) return null;
  let sourceIndex = 0;
  let compactCursor = 0;
  while (compactCursor < compactIndex && sourceIndex < text.length) {
    if (!/\s/.test(text[sourceIndex])) compactCursor += 1;
    sourceIndex += 1;
  }
  const start = sourceIndex;
  let matched = 0;
  while (matched < compactValue.length && sourceIndex < text.length) {
    if (!/\s/.test(text[sourceIndex])) matched += 1;
    sourceIndex += 1;
  }
  return [start, sourceIndex];
}

function priorityClass(priority?: string) {
  if (priority === '高' || priority === 'P0') return 'border-red-200 bg-red-50 text-red-700';
  if (priority === '中' || priority === 'P1') return 'border-orange-200 bg-orange-50 text-orange-700';
  return 'border-yellow-200 bg-yellow-50 text-yellow-700';
}

function modeMeta(mode: EditMode) {
  if (mode === 'insert') return { label: '插入', icon: Plus, color: '#22c55e', tint: 'rgba(34, 197, 94, .18)' };
  if (mode === 'delete') return { label: '删除', icon: Trash2, color: '#ef4444', tint: 'rgba(239, 68, 68, .16)' };
  return { label: '更改', icon: Pencil, color: '#eab308', tint: 'rgba(234, 179, 8, .2)' };
}

function effortLabel(effort?: string) {
  if (effort === 'easy') return '容易';
  if (effort === 'medium') return '中等';
  if (effort === 'hard') return '困难';
  return effort;
}

interface MatchGap {
  requirement: string;
  weight: 'hard' | 'must' | 'nice';
  evidence: string | null;
  suggestion: string;
}

interface JobMatchData {
  company?: string | null;
  title?: string | null;
  score?: number | null;
  grade?: string | null;
  verdict?: string | null;
  hardExcluded?: boolean;
  interviewTips?: string | null;
  interview_tips?: string | null;
  gaps?: MatchGap[] | null;
}

const gapWeightLabels: Record<MatchGap['weight'], string> = {
  hard: '硬性门槛',
  must: '核心能力',
  nice: '加分项',
};

function gapWeightClass(weight: MatchGap['weight']) {
  if (weight === 'hard') return 'border-red-200 bg-red-50 text-red-700';
  if (weight === 'must') return 'border-orange-200 bg-orange-50 text-orange-700';
  return 'border-yellow-200 bg-yellow-50 text-yellow-700';
}

function GapCard({ gap }: { gap: MatchGap }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface shadow-sm transition-colors hover:bg-surface-container-low">
      <div className="flex items-start justify-between gap-3 border-b border-outline-variant px-4 py-3">
        <span className="text-sm font-semibold text-on-surface">{gap.requirement}</span>
        <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-medium ${gapWeightClass(gap.weight)}`}>{gapWeightLabels[gap.weight] || gap.weight}</span>
      </div>
      <div className="space-y-2 px-4 py-3">
        {gap.evidence && <p className="text-xs leading-5 text-on-surface-variant"><span className="font-medium text-on-surface">现状：</span>{gap.evidence}</p>}
        <p className="text-xs leading-5 text-on-surface-variant"><span className="font-medium text-on-surface">建议：</span>{gap.suggestion}</p>
      </div>
    </div>
  );
}

function SuggestionCard({ suggestion }: { suggestion: AnnotationSuggestion }) {
  const mode = modeMeta(getMode(suggestion));
  const Icon = mode.icon;
  const title = suggestion.issue || suggestion.problem || suggestion.category || '优化建议';
  const text = suggestion.suggested_text || suggestion.suggestedText || suggestion.recommendation || suggestion.resume_text || suggestion.resumeText;
  return (
    <div className="rounded-xl border border-outline-variant bg-surface shadow-sm transition-colors hover:bg-surface-container-low">
      <div className="flex items-start justify-between gap-3 border-b border-outline-variant px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium" style={{ color: mode.color, borderColor: mode.color }}>
            <Icon className="h-3.5 w-3.5" />{mode.label}
          </span>
          <span className="truncate text-sm font-semibold text-on-surface">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {suggestion.priority && <span className={`rounded-full border px-2 py-1 text-xs font-medium ${priorityClass(suggestion.priority)}`}>{suggestion.priority === '高' ? 'P0' : suggestion.priority === '中' ? 'P1' : suggestion.priority === '低' ? 'P2' : suggestion.priority}</span>}
          {!!(suggestion.score_impact || suggestion.scoreImpact) && <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-medium text-red-600">-{suggestion.score_impact || suggestion.scoreImpact} 分</span>}
        </div>
      </div>
      <div className="space-y-3 px-4 py-3">
        <p className="text-xs leading-5 text-on-surface-variant">{suggestion.problem || suggestion.issue || suggestion.recommendation}</p>
        {text && <div className="whitespace-pre-wrap rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-xs leading-5 text-on-surface">{text}</div>}
      </div>
      <div className="flex gap-2 border-t border-outline-variant bg-surface-container-lowest px-4 py-2 text-xs text-on-surface-variant">
        {suggestion.dimension && <span className="rounded-full bg-surface-container-high px-2 py-1">{dimensionLabels[suggestion.dimension] || suggestion.dimension}</span>}
        {suggestion.effort && <span className="rounded-full border border-outline-variant px-2 py-1">修改难度：{effortLabel(suggestion.effort)}</span>}
      </div>
    </div>
  );
}

export default function ResumeAnnotationPanel({ resumeText, analysis, onExport, exporting, onReanalyze, reanalyzing }: ResumeAnnotationPanelProps) {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('resume');
  const rootRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const markRefs = useRef(new Map<number, HTMLElement>());
  const cardRefs = useRef(new Map<number, HTMLDivElement>());
  const [annotationLayout, setAnnotationLayout] = useState<{
    height: number;
    paths: Array<{ index: number; path: string; color: string }>;
    tops: Record<number, number>;
  }>({ height: 0, paths: [], tops: {} });
  const allSuggestions = Array.isArray(analysis?.suggestions) ? analysis.suggestions as AnnotationSuggestion[] : [];
  const suggestions = useMemo<AnnotationSuggestion[]>(() => {
    return allSuggestions.filter((suggestion) => (suggestion.source || 'resume') === activeTab);
  }, [allSuggestions, activeTab]);
  const positioned = useMemo(() => suggestions.map((suggestion, index) => ({ suggestion, index, range: findRange(resumeText, suggestion.resume_text || suggestion.resumeText) })).filter((item) => item.range), [resumeText, suggestions]);
  const unmatched = useMemo(() => suggestions.filter((suggestion) => !findRange(resumeText, suggestion.resume_text || suggestion.resumeText)), [resumeText, suggestions]);
  const marks = useMemo(() => {
    const sorted = positioned.slice().sort((a, b) => (a.range?.[0] || 0) - (b.range?.[0] || 0));
    const result: Array<{ text: string; suggestion?: AnnotationSuggestion; index?: number }> = [];
    let cursor = 0;
    sorted.forEach(({ suggestion, index, range }) => {
      if (!range || range[0] < cursor) return;
      if (range[0] > cursor) result.push({ text: resumeText.slice(cursor, range[0]) });
      result.push({ text: resumeText.slice(range[0], range[1]), suggestion, index });
      cursor = range[1];
    });
    if (cursor < resumeText.length) result.push({ text: resumeText.slice(cursor) });
    return result;
  }, [positioned, resumeText]);

  const scoreDetail = analysis?.scoreDetail || {};
  const jobMatch = analysis?.jobMatch as JobMatchData | undefined;
  const interviewTips = jobMatch?.interviewTips || jobMatch?.interview_tips || '';
  const gaps = Array.isArray(jobMatch?.gaps) ? jobMatch.gaps : [];
  const dimensions = [
    ['完整性', scoreDetail.contentScore, 25],
    ['清晰度', scoreDetail.structureScore, 20],
    ['说服力', scoreDetail.skillMatchScore, 40],
    ['专业性', scoreDetail.expressionScore, 15],
  ];
  const hasJobData = allSuggestions.some((suggestion) => suggestion.source === 'jd') || analysis?.jobMatch;
  const scoreSummary = activeTab === 'resume'
    ? {
        grade: analysis?.grade || gradeFromScore(analysis?.overallScore ?? 0),
        score: analysis?.overallScore || 0,
        label: '综合评分',
        metrics: dimensions.map(([label, score, max]) => ({ label, score: score || 0, max })),
      }
    : {
        grade: jobMatch?.grade || '-',
        score: jobMatch?.score ?? 0,
        label: '岗位匹配度',
        metrics: [
          { label: '匹配等级', score: jobMatch?.grade || '-', max: '' },
          { label: '岗位结论', score: jobMatch?.verdict || '-', max: '' },
          { label: '硬性条件', score: jobMatch?.hardExcluded ? '有风险' : '通过', max: '' },
        ],
      };

  useLayoutEffect(() => {
    const root = rootRef.current;
    const textColumn = textRef.current;
    if (!root || !textColumn || positioned.length === 0) {
      setAnnotationLayout({ height: 0, paths: [], tops: {} });
      return;
    }

    const relayout = () => {
      const rootRect = root.getBoundingClientRect();
      const textRect = textColumn.getBoundingClientRect();
      const cards = positioned
        .map(({ index, suggestion }) => {
          const mark = markRefs.current.get(index);
          const card = cardRefs.current.get(index);
          if (!mark || !card) return null;
          const markRect = mark.getBoundingClientRect();
          const cardRect = card.getBoundingClientRect();
          return { index, suggestion, markRect, cardRect };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null)
        .sort((left, right) => left.markRect.top - right.markRect.top);
      if (cards.length === 0) return;

      const tops: Record<number, number> = {};
      let nextTop = 0;
      for (const item of cards) {
        const desiredTop = item.markRect.top - rootRect.top + item.markRect.height / 2 - item.cardRect.height / 2;
        tops[item.index] = Math.max(desiredTop, nextTop);
        nextTop = tops[item.index] + item.cardRect.height + 12;
      }

      const height = Math.max(textRect.height, nextTop - 12);
      const paths = cards.map((item) => {
        const startX = item.markRect.right - rootRect.left;
        const startY = item.markRect.top - rootRect.top + item.markRect.height / 2;
        const endX = item.cardRect.left - rootRect.left;
        const endY = tops[item.index] + item.cardRect.height / 2;
        const controlX = Math.max(36, (endX - startX) * 0.45);
        return {
          index: item.index,
          color: modeMeta(getMode(item.suggestion)).color,
          path: `M ${startX} ${startY} C ${startX + controlX} ${startY}, ${endX - controlX} ${endY}, ${endX} ${endY}`,
        };
      });
      setAnnotationLayout({ height, paths, tops });
    };

    const frame = requestAnimationFrame(relayout);
    const observer = new ResizeObserver(relayout);
    observer.observe(root);
    observer.observe(textColumn);
    cardRefs.current.forEach((card) => observer.observe(card));
    window.addEventListener('resize', relayout);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', relayout);
    };
  }, [activeTab, positioned, marks]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div className="inline-flex rounded-lg bg-surface-container-low p-1" role="tablist" aria-label="分析类型">
          <button onClick={() => setActiveTab('resume')} className={`rounded-md px-4 py-2 text-sm font-medium ${activeTab === 'resume' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant'}`} role="tab" aria-selected={activeTab === 'resume'}>普通分析</button>
          <button onClick={() => setActiveTab('jd')} className={`rounded-md px-4 py-2 text-sm font-medium ${activeTab === 'jd' ? 'bg-surface text-primary shadow-sm' : 'text-on-surface-variant'}`} role="tab" aria-selected={activeTab === 'jd'}>JD 分析</button>
        </div>
        <span className="text-xs text-on-surface-variant">{activeTab === 'resume' ? '简历表达与内容质量' : hasJobData ? '岗位要求匹配分析' : '尚未生成岗位匹配分析'}</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant pb-4">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-500 text-2xl font-bold text-white">{scoreSummary.grade}</div>
          <div><div className="text-2xl font-bold text-on-surface">{scoreSummary.score}<span className="text-sm font-normal text-on-surface-variant"> /100</span></div><div className="text-xs text-on-surface-variant">{scoreSummary.label}</div></div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">{scoreSummary.metrics.map(({ label, score, max }) => <div key={label as string}><span className="text-on-surface-variant">{label as string} </span><b>{score as string | number}</b>{max !== '' && <span className="text-on-surface-variant">/{max}</span>}</div>)}</div>
        </div>
        <div className="flex gap-2"><button onClick={onExport} disabled={exporting} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium hover:bg-surface-container-high disabled:opacity-50"><Download className="h-4 w-4" />{exporting ? '导出中...' : '导出报告'}</button>{onReanalyze && <button onClick={onReanalyze} disabled={reanalyzing} className="inline-flex items-center gap-2 rounded-lg border border-outline-variant px-3 py-2 text-sm font-medium hover:bg-surface-container-high disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${reanalyzing ? 'animate-spin' : ''}`} />{reanalyzing ? '重新分析中...' : '重新分析'}</button>}</div>
      </div>

      {activeTab === 'jd' && !hasJobData ? (
        <div className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest px-6 py-14 text-center"><AlertTriangle className="mx-auto mb-3 h-7 w-7 text-tertiary" /><h3 className="font-semibold text-on-surface">暂无 JD 分析结果</h3><p className="mt-2 text-sm text-on-surface-variant">请在上传简历时选择“基于自己填写的岗位 JD”后重新分析。</p></div>
      ) : (
        <>
          {activeTab === 'jd' && jobMatch && <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm leading-6 text-on-surface"><span className="font-semibold">目标岗位：</span>{jobMatch.company ? `${jobMatch.company} · ` : ''}{jobMatch.title || '未命名岗位'}</div>}
          {activeTab === 'jd' && interviewTips && <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3"><p className="mb-1 text-sm font-semibold text-on-surface">面试准备建议</p><div className="prose prose-sm dark:prose-invert max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{interviewTips}</ReactMarkdown></div></div>}
          {activeTab === 'jd' && gaps.length > 0 && <div className="space-y-3"><p className="text-sm font-medium text-on-surface-variant">与理想候选人的差距</p><div className="grid gap-3 md:grid-cols-2">{gaps.map((gap, index) => <GapCard key={`${gap.requirement}-${index}`} gap={gap} />)}</div></div>}
          {activeTab === 'resume' && analysis?.summary && <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-3 text-sm leading-6 text-on-surface">{analysis.summary}</div>}
          <div ref={rootRef} className="relative" style={{ minHeight: annotationLayout.height || undefined }}>
            <svg className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" aria-hidden="true">
              {annotationLayout.paths.map(({ index, path, color }) => <path key={index} d={path} fill="none" stroke={color} strokeWidth="1.5" strokeOpacity="0.75" />)}
            </svg>
            <div ref={textRef} className="whitespace-pre-wrap break-words rounded-xl border border-outline-variant bg-surface p-5 text-sm leading-8 text-on-surface lg:mr-[384px]">
              {marks.length ? marks.map((mark, index) => mark.suggestion ? <mark key={index} ref={(element) => { if (element !== null && mark.index !== undefined) markRefs.current.set(mark.index, element); }} className="rounded-sm border-b-2 px-0.5" style={{ borderColor: modeMeta(getMode(mark.suggestion)).color, backgroundColor: modeMeta(getMode(mark.suggestion)).tint }}>{mark.text}</mark> : <span key={index}>{mark.text}</span>) : resumeText}
            </div>
            <div className="mt-4 space-y-3 lg:hidden">{positioned.map(({ suggestion, index }) => <SuggestionCard key={`${suggestion.issue}-${index}`} suggestion={suggestion} />)}</div>
            <div className="absolute right-0 top-0 hidden w-[360px] lg:block">
              {positioned.map(({ suggestion, index }) => <div key={`${suggestion.issue}-${index}`} ref={(element) => { if (element !== null) cardRefs.current.set(index, element); }} className="absolute left-0 w-full" style={{ top: annotationLayout.tops[index] || 0 }}><SuggestionCard suggestion={suggestion} /></div>)}
            </div>
          </div>
          {unmatched.length > 0 && <div className="border-t border-outline-variant pt-4"><p className="mb-3 text-sm font-medium text-on-surface-variant">以下建议针对整体或缺失内容，无法定位到具体原文：</p><div className="grid gap-3 md:grid-cols-2">{unmatched.map((suggestion, index) => <SuggestionCard key={`${suggestion.issue}-${index}`} suggestion={suggestion} />)}</div></div>}
          {suggestions.length === 0 && <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-6 py-12 text-center text-sm text-on-surface-variant"><CheckCircle2 className="mx-auto mb-3 h-7 w-7 text-green-500" />暂无该类型的分析建议</div>}
        </>
      )}
    </div>
  );
}
