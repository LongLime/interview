import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ThumbsUp, Eye, Calendar, Users, Copy, CheckCircle, MessageSquare } from 'lucide-react';
import { contributionApi, ContributionDetail } from '../api/contribution';

const DIFFICULTY_MAP: Record<string, { label: string; color: string }> = {
  EASY: { label: '简单', color: 'bg-green-100 text-green-700' },
  MEDIUM: { label: '中等', color: 'bg-yellow-100 text-yellow-700' },
  HARD: { label: '困难', color: 'bg-red-100 text-red-700' },
};

const QUESTION_TYPE_MAP: Record<string, string> = {
  DISCUSSION: '开放讨论',
  CODING: '手撕代码',
  DESIGN: '系统设计',
  SINGLE: '单选题',
  MULTI: '多选题',
  BEHAVIOR: '行为面试',
};

const INTERVIEW_TYPE_MAP: Record<string, string> = {
  SOCIAL: '社招',
  CAMPUS: '校招',
  INTERN: '实习',
};

export default function ContributionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ContributionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [helpfulLoading, setHelpfulLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadDetail();
    }
  }, [id]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      const data = await contributionApi.getDetail(Number(id));
      setDetail(data);
    } catch (error) {
      console.error('加载面经详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (text: string, questionId: number) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(questionId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleHelpful = async () => {
    if (!id) return;
    setHelpfulLoading(true);
    try {
      await contributionApi.markHelpful(Number(id));
      setDetail(prev => prev ? {
        ...prev,
        helpfulCount: prev.helpfulCount + 1
      } : null);
    } catch (error) {
      console.error('标记失败:', error);
    } finally {
      setHelpfulLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-container"></div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-20">
        <p className="text-on-surface-variant">面经不存在</p>
        <button
          onClick={() => navigate('/contribution')}
          className="mt-4 px-4 py-2 text-primary hover:underline"
        >
          返回列表
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-0">
      {/* 顶部导航 */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/contribution')}
          className="w-10 h-10 bg-surface border border-outline-variant rounded-xl flex items-center justify-center hover:bg-surface-container-high dark:hover:bg-surface-container-high transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-on-surface-variant" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-on-surface">面经详情</h1>
        </div>
        <button
          onClick={handleHelpful}
          disabled={helpfulLoading}
          className="flex items-center gap-2 px-4 py-2 bg-surface border border-outline-variant rounded-xl hover:bg-surface-container-high dark:hover:bg-surface-container-high transition-colors disabled:opacity-50"
        >
          <ThumbsUp className="w-4 h-4 text-on-surface-variant" />
          <span className="text-sm text-on-surface-variant">{detail.helpfulCount}</span>
        </button>
      </div>

      {/* 面经信息卡片 */}
      <div className="bg-surface rounded-xl border border-outline-variant p-6 mb-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold text-on-surface mb-2">
              {detail.companyName}
              {detail.department && <span className="text-outline">· {detail.department}</span>}
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 bg-primary-container/30 dark:bg-primary-container/30 text-primary dark:text-primary-400 text-sm rounded-full">
                {detail.position}
              </span>
              <span className="px-3 py-1 bg-surface-container-high text-on-surface-variant text-sm rounded-full">
                {INTERVIEW_TYPE_MAP[detail.interviewType] || detail.interviewType}
              </span>
              <span className="px-3 py-1 bg-surface-container-high text-on-surface-variant text-sm rounded-full">
                第{detail.interviewRound}轮面试
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-on-surface-variant">
            <span className="flex items-center gap-1">
              <Eye className="w-4 h-4" /> {detail.viewCount} 浏览
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="w-4 h-4" /> {detail.helpfulCount} 有用
            </span>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm text-on-surface-variant border-t border-outline-variant pt-4">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {detail.interviewYear}.{detail.interviewMonth}
          </span>
          <span className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            {detail.anonymous ? '匿名用户' : detail.contributorNickname}
          </span>
          <span>{detail.questions.length}道题目</span>
        </div>
      </div>

      {/* 面试题目列表 */}
      <div className="space-y-6">
        {detail.questions.map((q, index) => (
          <div key={q.id} className="bg-surface rounded-xl border border-outline-variant overflow-hidden">
            {/* 题目头部 */}
            <div className="p-5 border-b border-outline-variant">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 bg-primary-container/30 dark:bg-primary-container/30 rounded-xl flex items-center justify-center text-primary dark:text-primary-400 font-bold text-lg flex-shrink-0">
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-lg font-medium text-on-surface">
                      {q.questionText}
                    </p>
                    <button
                      onClick={() => handleCopy(q.questionText, q.id)}
                      className="text-outline hover:text-on-surface-variant dark:hover:text-on-surface-variant transition-colors"
                      title="复制题目"
                    >
                      {copiedId === q.id ? (
                        <CheckCircle className="w-5 h-5 text-green-500" />
                      ) : (
                        <Copy className="w-5 h-5" />
                      )}
                    </button>
                  </div>
                  {q.followUpText && (
                    <div className="flex items-start gap-2 mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <MessageSquare className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-amber-700 dark:text-amber-300">
                        <span className="font-medium">追问：</span>{q.followUpText}
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {q.categoryLabel && (
                      <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded">
                        {q.categoryLabel}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 text-xs rounded ${DIFFICULTY_MAP[q.difficulty]?.color || 'bg-slate-100 text-slate-600'}`}>
                      {DIFFICULTY_MAP[q.difficulty]?.label || q.difficulty}
                    </span>
                    <span className="px-2 py-0.5 bg-surface-container-high text-on-surface-variant text-xs rounded">
                      {QUESTION_TYPE_MAP[q.questionType] || q.questionType}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 参考答案 */}
            {q.answerText && (
              <div className="p-5 bg-surface-container-lowest">
                <h4 className="text-sm font-medium text-slate-600 dark:text-slate-300 mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  参考答案
                </h4>
                <div className="bg-surface rounded-lg p-4 border border-outline-variant">
                  <p className="text-on-surface-variant whitespace-pre-wrap leading-relaxed">
                    {q.answerText}
                  </p>
                </div>
                {q.keyPoints && q.keyPoints.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {q.keyPoints.map((point, idx) => (
                      <span key={idx} className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs rounded">
                        {point}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 底部提示 */}
      <div className="mt-8 p-4 bg-primary-container/20 dark:bg-primary-container/20 rounded-xl border border-primary-container/30">
        <p className="text-sm text-primary dark:text-primary-400 text-center">
          💡 这些都是用户分享的真实面试题目，祝您面试顺利！如有收获，欢迎分享给更多同学。
        </p>
      </div>
    </div>
  );
}
