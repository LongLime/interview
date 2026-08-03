import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Send, CheckCircle } from 'lucide-react';
import { contributionApi, Company, QuestionSubmit } from '../api/contribution';

const INTERVIEW_TYPES = [
  { value: 'SOCIAL', label: '社招' },
  { value: 'CAMPUS', label: '校招' },
  { value: 'INTERN', label: '实习' },
];

const DIFFICULTIES = [
  { value: 'EASY', label: '简单' },
  { value: 'MEDIUM', label: '中等' },
  { value: 'HARD', label: '困难' },
];

const QUESTION_TYPES = [
  { value: 'DISCUSSION', label: '开放讨论' },
  { value: 'CODING', label: '手撕代码' },
  { value: 'DESIGN', label: '系统设计' },
  { value: 'SINGLE', label: '单选题' },
  { value: 'MULTI', label: '多选题' },
  { value: 'BEHAVIOR', label: '行为面试' },
];

const CATEGORY_LABELS = [
  'Java基础', 'Java并发', 'JVM', 'MySQL', 'Redis',
  'Spring', '分布式', '微服务', '消息队列', '算法',
  '系统设计', '项目经验', '其他'
];

export default function ContributionSubmitPage() {
  const navigate = useNavigate();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitId, setSubmitId] = useState<number | null>(null);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [formData, setFormData] = useState({
    companyId: '',
    department: '',
    position: '',
    interviewYear: currentYear.toString(),
    interviewMonth: currentMonth.toString(),
    interviewType: 'SOCIAL',
    interviewRound: '1',
    contributorNickname: '',
    anonymous: true,
  });

  const [questions, setQuestions] = useState<QuestionSubmit[]>([
    { questionText: '', difficulty: 'MEDIUM', questionType: 'DISCUSSION' }
  ]);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    try {
      const data = await contributionApi.listCompanies();
      setCompanies(data);
    } catch (error) {
      console.error('加载公司列表失败:', error);
    }
  };

  const addQuestion = () => {
    setQuestions([...questions, {
      questionText: '',
      difficulty: 'MEDIUM',
      questionType: 'DISCUSSION'
    }]);
  };

  const removeQuestion = (index: number) => {
    if (questions.length > 1) {
      setQuestions(questions.filter((_, i) => i !== index));
    }
  };

  const updateQuestion = (index: number, field: keyof QuestionSubmit, value: string) => {
    const updated = [...questions];
    (updated[index] as any)[field] = value;
    setQuestions(updated);
  };

  const handleSubmit = async () => {
    if (!formData.companyId) {
      alert('请选择公司');
      return;
    }
    if (!formData.position) {
      alert('请填写岗位');
      return;
    }
    if (questions.every(q => !q.questionText.trim())) {
      alert('请至少填写一道面试题目');
      return;
    }

    setSubmitting(true);
    try {
      const validQuestions = questions.filter(q => q.questionText.trim());
      const res = await contributionApi.submit({
        companyId: Number(formData.companyId),
        department: formData.department,
        position: formData.position,
        interviewYear: Number(formData.interviewYear),
        interviewMonth: Number(formData.interviewMonth),
        interviewType: formData.interviewType,
        interviewRound: Number(formData.interviewRound),
        questions: validQuestions,
        contributorNickname: formData.contributorNickname,
        anonymous: formData.anonymous,
      });
      setSubmitId(res.id);
      setSubmitted(true);
    } catch (error: any) {
      alert(error.message || '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto text-center py-20">
        <div className="w-20 h-20 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-on-surface mb-2">提交成功！</h2>
        <p className="text-on-surface-variant mb-8">
          感谢您的分享，面经正在审核中，审核通过后将展示给更多求职者。
        </p>
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => navigate('/contribution')}
            className="px-6 py-2.5 bg-primary-container text-on-primary rounded-xl hover:bg-primary-container transition-colors"
          >
            查看面经
          </button>
          <button
            onClick={() => {
              setSubmitted(false);
              setFormData({
                companyId: '',
                department: '',
                position: '',
                interviewYear: currentYear.toString(),
                interviewMonth: currentMonth.toString(),
                interviewType: 'SOCIAL',
                interviewRound: '1',
                contributorNickname: '',
                anonymous: true,
              });
              setQuestions([{ questionText: '', difficulty: 'MEDIUM', questionType: 'DISCUSSION' }]);
            }}
            className="px-6 py-2.5 bg-surface-container-high text-on-surface-variant rounded-xl hover:bg-surface-container transition-colors"
          >
            继续提交
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 md:px-0">
      {/* 页面标题 */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/contribution')}
          className="w-10 h-10 bg-surface border border-outline-variant rounded-xl flex items-center justify-center hover:bg-surface-container-high dark:hover:bg-surface-container-high transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-on-surface-variant" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-on-surface">贡献面经</h1>
          <p className="text-on-surface-variant">分享您的面试经验，帮助更多求职者</p>
        </div>
      </div>

      {/* 表单 */}
      <div className="bg-surface rounded-xl border border-outline-variant divide-y divide-outline-variant">
        {/* 基本信息 */}
        <div className="p-6">
          <h2 className="text-lg font-semibold text-on-surface mb-4">基本信息</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-on-surface-variant mb-1.5">
                公司 <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.companyId}
                onChange={(e) => setFormData({ ...formData, companyId: e.target.value })}
                className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface-variant"
              >
                <option value="">选择公司</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                部门
              </label>
              <input
                type="text"
                value={formData.department}
                onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                placeholder="如：淘宝-交易技术部"
                className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface-variant placeholder-outline"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                岗位 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.position}
                onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                placeholder="如：Java后端开发"
                className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface-variant placeholder-outline"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                面试类型
              </label>
              <select
                value={formData.interviewType}
                onChange={(e) => setFormData({ ...formData, interviewType: e.target.value })}
                className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface-variant"
              >
                {INTERVIEW_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                面试时间
              </label>
              <div className="flex gap-2">
                <select
                  value={formData.interviewYear}
                  onChange={(e) => setFormData({ ...formData, interviewYear: e.target.value })}
                  className="flex-1 px-3 py-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface-variant"
                >
                  {Array.from({ length: 5 }, (_, i) => currentYear - i).map(y => (
                    <option key={y} value={y}>{y}年</option>
                  ))}
                </select>
                <select
                  value={formData.interviewMonth}
                  onChange={(e) => setFormData({ ...formData, interviewMonth: e.target.value })}
                  className="w-20 px-3 py-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface-variant"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                    <option key={m} value={m}>{m}月</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                面试轮次
              </label>
              <select
                value={formData.interviewRound}
                onChange={(e) => setFormData({ ...formData, interviewRound: e.target.value })}
                className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface-variant"
              >
                {[1, 2, 3, 4, 5].map(n => (
                  <option key={n} value={n}>第{n}轮</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* 面试题目 */}
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-on-surface">面试题目</h2>
            <button
              onClick={addQuestion}
              className="flex items-center gap-1.5 px-3 py-1.5 text-primary hover:bg-primary-container/30 dark:hover:bg-primary-container/30 rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              添加题目
            </button>
          </div>
          <div className="space-y-6">
            {questions.map((q, index) => (
              <div key={index} className="bg-surface-container-lowest rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  <span className="px-2 py-1 bg-primary-container/30 dark:bg-primary-container/30 text-primary dark:text-primary-400 text-xs font-medium rounded">
                    题目 {index + 1}
                  </span>
                  {questions.length > 1 && (
                    <button
                      onClick={() => removeQuestion(index)}
                      className="ml-auto text-outline hover:text-error transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      题目内容 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={q.questionText}
                      onChange={(e) => updateQuestion(index, 'questionText', e.target.value)}
                      placeholder="请输入面试题目"
                      rows={2}
                      className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-on-surface-variant placeholder-outline resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      追问（可选）
                    </label>
                    <input
                      type="text"
                      value={q.followUpText || ''}
                      onChange={(e) => updateQuestion(index, 'followUpText', e.target.value)}
                      placeholder="面试官的追问（如果有）"
                      className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-on-surface-variant placeholder-outline"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        难度
                      </label>
                      <select
                        value={q.difficulty || 'MEDIUM'}
                        onChange={(e) => updateQuestion(index, 'difficulty', e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-on-surface-variant"
                      >
                        {DIFFICULTIES.map(d => (
                          <option key={d.value} value={d.value}>{d.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        题目类型
                      </label>
                      <select
                        value={q.questionType || 'DISCUSSION'}
                        onChange={(e) => updateQuestion(index, 'questionType', e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-on-surface-variant"
                      >
                        {QUESTION_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                        知识点
                      </label>
                      <select
                        value={q.categoryLabel || ''}
                        onChange={(e) => updateQuestion(index, 'categoryLabel', e.target.value)}
                        className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-on-surface-variant"
                      >
                        <option value="">选择分类</option>
                        {CATEGORY_LABELS.map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                      参考答案（可选，但强烈建议填写）
                    </label>
                    <textarea
                      value={q.answerText || ''}
                      onChange={(e) => updateQuestion(index, 'answerText', e.target.value)}
                      placeholder="请输入参考答案，帮助其他人学习"
                      rows={3}
                      className="w-full px-3 py-2 bg-surface border border-outline-variant rounded-lg text-on-surface-variant placeholder-outline resize-none"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 贡献者信息 */}
        <div className="p-6">
          <h2 className="text-lg font-semibold text-on-surface mb-4">贡献者信息</h2>
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                昵称（可选）
              </label>
              <input
                type="text"
                value={formData.contributorNickname}
                onChange={(e) => setFormData({ ...formData, contributorNickname: e.target.value })}
                placeholder="留下您的昵称，让大家认识您"
                className="w-full px-3 py-2.5 bg-surface-container-lowest border border-outline-variant rounded-lg text-on-surface-variant placeholder-outline"
              />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.anonymous}
                onChange={(e) => setFormData({ ...formData, anonymous: e.target.checked })}
                className="w-4 h-4 rounded border-outline-variant text-primary focus:border-primary-container"
              />
              <span className="text-sm text-on-surface-variant">匿名贡献（不显示昵称）</span>
            </label>
          </div>
        </div>
      </div>

      {/* 提交按钮 */}
      <div className="flex items-center justify-end gap-4 mt-6">
        <button
          onClick={() => navigate('/contribution')}
          className="px-6 py-2.5 bg-surface-container-high text-on-surface-variant rounded-xl hover:bg-surface-container transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex items-center gap-2 px-6 py-2.5 bg-primary-container text-on-primary rounded-xl hover:bg-primary-container transition-all shadow-sm disabled:opacity-50"
        >
          {submitting ? (
            <>
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              提交中...
            </>
          ) : (
            <>
              <Send className="w-5 h-5" />
              提交面经
            </>
          )}
        </button>
      </div>
    </div>
  );
}
