import { useState } from 'react';
import { CheckCircle2, FileSearch, Sparkles, Users } from 'lucide-react';
import { resumeApi } from '../api/resume';
import { getErrorMessage } from '../api/request';
import FileUploadCard from '../components/FileUploadCard';

interface UploadPageProps {
  onUploadComplete: (resumeId: number) => void;
}

export default function UploadPage({ onUploadComplete }: UploadPageProps) {
  const [mode, setMode] = useState<'choose' | 'general' | 'jd' | 'recruitment'>('choose');
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [error, setError] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState('');
  const [jdText, setJdText] = useState('');

  const handleUpload = async (file: File) => {
    if (mode === 'jd' && (!jobTitle.trim() || jdText.trim().length < 50)) {
      setError('请填写岗位名称，并输入至少 50 字的 JD 正文');
      return;
    }
    setUploading(true);
    setError('');

    try {
      const data = await resumeApi.uploadAndAnalyze(file, mode === 'jd' ? {
        mode: 'CUSTOM_JD',
        title: jobTitle.trim(),
        company: company.trim(),
        jdText: jdText.trim(),
      } : { mode: 'GENERAL' });

      // 异步模式：只检查上传是否成功（storage 信息）
      if (!data.storage || !data.storage.resumeId) {
        throw new Error('上传失败，请重试');
      }

      if (mode === 'jd') {
        await resumeApi.analyzeAgainstJd({
          resumeId: data.storage.resumeId,
          jdText: jdText.trim(),
          title: jobTitle.trim(),
          company: company.trim(),
        });
      }

      setUploaded(true);
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      onUploadComplete(data.storage.resumeId);
    } catch (err) {
      setError(getErrorMessage(err));
      setUploading(false);
    }
  };

  return (
    uploaded ? (
      <div className="max-w-3xl mx-auto pt-16 text-center">
        <CheckCircle2 className="w-16 h-16 mx-auto mb-6 text-green-500" />
        <h2 className="text-2xl font-semibold text-on-surface mb-2">简历上传成功</h2>
        <p className="text-on-surface-variant">{mode === 'jd' ? '岗位匹配分析已提交，完成后会自动显示结果' : '系统正在分析您的简历，分析完成后会自动显示结果'}</p>
      </div>
    ) : mode === 'choose' ? (
      <div className="max-w-4xl mx-auto pt-16">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-on-surface mb-3">开始简历分析</h1>
          <p className="text-lg text-on-surface-variant">选择分析依据，上传后生成针对性的评估结果</p>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <button onClick={() => setMode('general')} className="rounded-xl border border-outline-variant bg-surface p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary-container hover:shadow-lg">
            <Sparkles className="mb-5 h-8 w-8 text-primary-container" />
            <h2 className="text-lg font-semibold text-on-surface">通用分析</h2>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">分析简历内容质量、结构和表达方式。</p>
          </button>
          <button onClick={() => setMode('jd')} className="rounded-xl border border-outline-variant bg-surface p-6 text-left shadow-sm transition hover:-translate-y-1 hover:border-primary-container hover:shadow-lg">
            <FileSearch className="mb-5 h-8 w-8 text-primary-container" />
            <h2 className="text-lg font-semibold text-on-surface">根据岗位 JD 分析</h2>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">填写目标岗位，逐项比较招聘要求和简历证据。</p>
          </button>
          <button onClick={() => setMode('recruitment')} className="rounded-xl border border-dashed border-outline-variant bg-surface-container-lowest p-6 text-left transition hover:border-outline">
            <Users className="mb-5 h-8 w-8 text-on-surface-variant" />
            <h2 className="text-lg font-semibold text-on-surface">根据现有招聘</h2>
            <p className="mt-2 text-sm leading-6 text-on-surface-variant">招聘岗位数据正在升级，暂不可用。</p>
          </button>
        </div>
      </div>
    ) : mode === 'recruitment' ? (
      <div className="max-w-3xl mx-auto pt-16 text-center">
        <Users className="mx-auto mb-5 h-12 w-12 text-on-surface-variant" />
        <h2 className="text-2xl font-semibold text-on-surface mb-2">现有招聘暂不可用</h2>
        <p className="mb-6 text-on-surface-variant">招聘岗位数据正在升级，当前不能提交分析。</p>
        <button onClick={() => setMode('choose')} className="rounded-xl border border-outline-variant px-6 py-3 font-medium text-on-surface-variant hover:bg-surface-container-high">返回选择</button>
      </div>
    ) : (
      <div>
        {mode === 'jd' && (
          <div className="mx-auto mb-6 max-w-3xl rounded-xl border border-outline-variant bg-surface p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-on-surface">填写目标岗位</h2><p className="mt-1 text-sm text-on-surface-variant">这些信息只用于本次简历分析。</p></div>
              <button onClick={() => setMode('choose')} className="text-sm text-on-surface-variant hover:text-on-surface">返回选择</button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-on-surface">岗位名称<input value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} placeholder="例如：Java 后端工程师" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-normal outline-none focus:border-primary-container" /></label>
              <label className="text-sm font-medium text-on-surface">公司名称（选填）<input value={company} onChange={(event) => setCompany(event.target.value)} placeholder="例如：某某科技" className="mt-2 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-normal outline-none focus:border-primary-container" /></label>
            </div>
            <label className="mt-4 block text-sm font-medium text-on-surface">JD 正文<textarea value={jdText} onChange={(event) => setJdText(event.target.value)} placeholder="粘贴完整的岗位职责、任职要求和加分项，至少 50 字" rows={8} className="mt-2 w-full resize-y rounded-lg border border-outline-variant bg-surface px-3 py-2.5 font-normal leading-6 outline-none focus:border-primary-container" /></label>
            <p className="mt-2 text-right text-xs text-on-surface-variant">{jdText.trim().length} / 50 字</p>
          </div>
        )}
        <FileUploadCard
          title={mode === 'jd' ? '上传简历开始岗位匹配' : '开始您的 AI 模拟面试'}
          subtitle={mode === 'jd' ? '上传后将把简历与目标岗位逐项比较' : '上传 PDF 或 Word 简历，AI 将为您定制专属面试方案'}
          accept=".pdf,.doc,.docx,.txt"
          formatHint="支持 PDF, DOCX, TXT"
          maxSizeHint="最大 10MB"
          uploading={uploading}
          uploadButtonText={mode === 'jd' ? '上传并开始 JD 分析' : '开始上传'}
          selectButtonText="选择简历文件"
          error={error}
          onUpload={handleUpload}
        />
      </div>
    )
  );
}
