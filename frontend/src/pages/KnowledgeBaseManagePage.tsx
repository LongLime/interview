import {useCallback, useEffect, useRef, useState} from 'react';
import {AnimatePresence, motion} from 'framer-motion';
import {
  AlertCircle,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Download,
  Edit3,
  Eye,
  FileText,
  HardDrive,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {knowledgeBaseApi, KnowledgeBaseItem, KnowledgeBaseStats, SortOption, VectorStatus,} from '../api/knowledgebase';
import DeleteConfirmDialog from '../components/DeleteConfirmDialog';

interface KnowledgeBaseManagePageProps {
  onUpload: () => void;
  onChat: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getFileIconAndColor(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf') {
    return { icon: 'picture_as_pdf', bgClass: 'bg-error-container', textClass: 'text-on-error-container' };
  }
  if (['doc', 'docx'].includes(ext)) {
    return { icon: 'description', bgClass: 'bg-surface-container-high', textClass: 'text-primary' };
  }
  if (['txt', 'md'].includes(ext)) {
    return { icon: 'article', bgClass: 'bg-tertiary-fixed-dim/30', textClass: 'text-on-tertiary-container' };
  }
  return { icon: 'description', bgClass: 'bg-surface-container-high', textClass: 'text-primary' };
}

function StatusBadge({ status }: { status: VectorStatus }) {
  switch (status) {
    case 'COMPLETED':
      return (
        <span className="status-badge status-success">
          已解析
        </span>
      );
    case 'PROCESSING':
      return (
        <span className="status-badge status-processing">
          <span className="w-1.5 h-1.5 rounded-full bg-outline animate-pulse mr-1.5" />
          解析中
        </span>
      );
    case 'PENDING':
      return (
        <span className="status-badge status-processing">
          待处理
        </span>
      );
    case 'FAILED':
      return (
        <span className="status-badge status-error">
          解析失败
        </span>
      );
    default:
      return (
        <span className="status-badge status-success">
          已解析
        </span>
      );
  }
}

export default function KnowledgeBaseManagePage({ onUpload, onChat }: KnowledgeBaseManagePageProps) {
  const [stats, setStats] = useState<KnowledgeBaseStats | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('time');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [deleteItem, setDeleteItem] = useState<KnowledgeBaseItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryValue, setEditingCategoryValue] = useState('');
  const [savingCategory, setSavingCategory] = useState(false);
  const categoryInputRef = useRef<HTMLInputElement>(null);

  const [revectorizing, setRevectorizing] = useState<number | null>(null);

  const loadDataSilent = useCallback(async () => {
    try {
      const [statsData, kbList, categoryList] = await Promise.all([
        knowledgeBaseApi.getStatistics(),
        searchKeyword
          ? knowledgeBaseApi.search(searchKeyword)
          : selectedCategory
          ? knowledgeBaseApi.getByCategory(selectedCategory)
          : knowledgeBaseApi.getAllKnowledgeBases(sortBy),
        knowledgeBaseApi.getAllCategories(),
      ]);
      setStats(statsData);
      setKnowledgeBases(kbList);
      setCategories(categoryList);
    } catch (error) {
      console.error('加载数据失败:', error);
    }
  }, [searchKeyword, sortBy, selectedCategory]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsData, kbList, categoryList] = await Promise.all([
        knowledgeBaseApi.getStatistics(),
        searchKeyword
          ? knowledgeBaseApi.search(searchKeyword)
          : selectedCategory
          ? knowledgeBaseApi.getByCategory(selectedCategory)
          : knowledgeBaseApi.getAllKnowledgeBases(sortBy),
        knowledgeBaseApi.getAllCategories(),
      ]);
      setStats(statsData);
      setKnowledgeBases(kbList);
      setCategories(categoryList);
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  }, [searchKeyword, sortBy, selectedCategory]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const hasPendingItems = knowledgeBases.some(
      kb => kb.vectorStatus === 'PENDING' || kb.vectorStatus === 'PROCESSING'
    );

    if (hasPendingItems && !loading) {
      const timer = setInterval(() => {
        loadDataSilent();
      }, 5000);

      return () => clearInterval(timer);
    }
  }, [knowledgeBases, loading, loadDataSilent]);

  const handleRevectorize = async (id: number) => {
    try {
      setRevectorizing(id);
      await knowledgeBaseApi.revectorize(id);
      await loadDataSilent();
    } catch (error) {
      console.error('重新向量化失败:', error);
    } finally {
      setRevectorizing(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      setDeleting(true);
      await knowledgeBaseApi.deleteKnowledgeBase(deleteItem.id);
      setDeleteItem(null);
      await loadData();
    } catch (error) {
      console.error('删除失败:', error);
    } finally {
      setDeleting(false);
    }
  };

  const handleDownload = async (kb: KnowledgeBaseItem) => {
    try {
      const blob = await knowledgeBaseApi.downloadKnowledgeBase(kb.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = kb.originalFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载失败:', error);
    }
  };

  const handleStartEditCategory = (kb: KnowledgeBaseItem) => {
    setEditingCategoryId(kb.id);
    setEditingCategoryValue(kb.category || '');
    setTimeout(() => {
      categoryInputRef.current?.focus();
    }, 50);
  };

  const handleCancelEditCategory = () => {
    setEditingCategoryId(null);
    setEditingCategoryValue('');
  };

  const handleSaveCategory = async (id: number) => {
    try {
      setSavingCategory(true);
      const categoryToSave = editingCategoryValue.trim() || null;
      await knowledgeBaseApi.updateCategory(id, categoryToSave);
      setEditingCategoryId(null);
      setEditingCategoryValue('');
      await loadData();
    } catch (error) {
      console.error('更新分类失败:', error);
    } finally {
      setSavingCategory(false);
    }
  };

  const handleCategoryKeyDown = (e: React.KeyboardEvent, id: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveCategory(id);
    } else if (e.key === 'Escape') {
      handleCancelEditCategory();
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  return (
    <div className="flex flex-col flex-1">
      {/* TopAppBar Contextual Header */}
      <header className="w-full flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-surface text-primary flex items-center justify-center shadow-sm">
            <Database className="w-[28px] h-[28px]" />
          </div>
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface">知识库管理</h2>
            <p className="font-body-md text-on-surface-variant mt-1">管理您的知识库文件，查看使用统计</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onChat}
            className="btn-secondary flex items-center gap-2"
          >
            <MessageSquare className="w-[20px] h-[20px]" />
            问答助手
          </button>
          <button
            onClick={onUpload}
            className="btn-primary flex items-center gap-2"
          >
            <Upload className="w-[20px] h-[20px]" />
            上传知识库
          </button>
        </div>
      </header>

      {/* Content Canvas */}
      <div className="flex-1 flex flex-col">
        {/* Tools Bar */}
        <div className="flex flex-col lg:flex-row gap-4 mb-6 p-4 bg-surface rounded-xl shadow-sm">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 relative search-focus rounded-full transition-all duration-200">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-outline" />
            <input
              type="text"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              placeholder="搜索知识库名称..."
              className="w-full h-11 pl-11 pr-4 bg-transparent border border-outline-variant rounded-full text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-0"
            />
          </form>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => {
                  setSortBy(e.target.value as SortOption);
                  setSearchKeyword('');
                  setSelectedCategory(null);
                }}
                className="h-11 pl-4 pr-10 appearance-none bg-transparent border border-outline-variant rounded-lg text-body-md text-on-surface focus:outline-none focus:border-primary cursor-pointer hover:bg-surface-container-lowest transition-colors"
              >
                <option value="time">按时间排序</option>
                <option value="size">按大小排序</option>
                <option value="access">按访问排序</option>
                <option value="question">按提问排序</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-outline pointer-events-none" />
            </div>
            <div className="relative">
              <select
                value={selectedCategory || ''}
                onChange={(e) => {
                  setSelectedCategory(e.target.value || null);
                  setSearchKeyword('');
                }}
                className="h-11 pl-4 pr-10 appearance-none bg-transparent border border-outline-variant rounded-lg text-body-md text-on-surface focus:outline-none focus:border-primary cursor-pointer hover:bg-surface-container-lowest transition-colors"
              >
                <option value="">全部分类</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-outline pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Data Table */}
        <section className="bg-surface border border-outline-variant/30 rounded-xl soft-shadow overflow-hidden flex flex-col flex-1">
          {/* List Header (Desktop only) */}
          <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-4 bg-surface-container-low border-b border-outline-variant/30 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">
            <div className="col-span-5">文件名称</div>
            <div className="col-span-2 text-right">大小</div>
            <div className="col-span-2 text-right">添加时间</div>
            <div className="col-span-2 text-center">状态</div>
            <div className="col-span-1 text-right">操作</div>
          </div>

          {/* List Items */}
          <div className="flex flex-col divide-y divide-outline-variant/30">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-primary-container animate-spin" />
              </div>
            ) : knowledgeBases.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <HardDrive className="w-16 h-16 text-outline mx-auto mb-4" />
                <p className="font-body-md text-on-surface-variant">暂无知识库</p>
                <button
                  onClick={onUpload}
                  className="mt-4 text-primary hover:text-primary-container transition-colors font-medium"
                >
                  上传第一个知识库
                </button>
              </div>
            ) : (
              knowledgeBases.map((kb, index) => {
                const fileInfo = getFileIconAndColor(kb.originalFilename);
                return (
                  <motion.div
                    key={kb.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-surface-container transition-colors duration-150"
                  >
                    {/* File Name */}
                    <div className="col-span-1 md:col-span-5 flex items-center gap-3 overflow-hidden">
                      <div className={`w-10 h-10 rounded ${fileInfo.bgClass} flex items-center justify-center shrink-0 ${fileInfo.textClass}`}>
                        <span className="material-symbols-outlined text-[20px]">{fileInfo.icon}</span>
                      </div>
                      <div className="min-w-0">
                        {editingCategoryId === kb.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              ref={categoryInputRef}
                              type="text"
                              value={editingCategoryValue}
                              onChange={(e) => setEditingCategoryValue(e.target.value)}
                              onKeyDown={(e) => handleCategoryKeyDown(e, kb.id)}
                              placeholder="输入分类名称"
                              list="category-suggestions"
                              className="w-32 px-2 py-1 text-sm border border-primary-container/50 rounded focus:outline-none focus:border-primary bg-surface-container-lowest text-on-surface"
                              disabled={savingCategory}
                            />
                            <datalist id="category-suggestions">
                              {categories.map((cat) => (
                                <option key={cat} value={cat} />
                              ))}
                            </datalist>
                            <button
                              onClick={() => handleSaveCategory(kb.id)}
                              disabled={savingCategory}
                              className="p-1 text-primary hover:text-primary-container transition-colors"
                              title="保存"
                            >
                              {savingCategory ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Check className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={handleCancelEditCategory}
                              disabled={savingCategory}
                              className="p-1 text-outline hover:text-on-surface-variant transition-colors"
                              title="取消"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <span className="font-body-md text-body-md text-on-surface font-medium truncate block">
                              {kb.name}
                            </span>
                            {kb.category && (
                              <span
                                className="text-xs text-on-surface-variant truncate block cursor-pointer hover:text-primary transition-colors inline-flex items-center gap-1"
                                onClick={() => handleStartEditCategory(kb)}
                                title="点击编辑分类"
                              >
                                <span className="opacity-60 group-hover:opacity-100">{kb.category}</span>
                                <Edit3 className="w-3 h-3 opacity-0 group-hover:opacity-100" />
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Size */}
                    <div className="col-span-1 md:col-span-2 text-left md:text-right font-body-md text-body-md text-on-surface-variant">
                      <span className="md:hidden font-label-sm text-outline mr-2">大小:</span>
                      {formatFileSize(kb.fileSize)}
                    </div>

                    {/* Time */}
                    <div className="col-span-1 md:col-span-2 text-left md:text-right font-body-md text-body-md text-on-surface-variant">
                      <span className="md:hidden font-label-sm text-outline mr-2">时间:</span>
                      {formatDate(kb.uploadedAt)}
                    </div>

                    {/* Status */}
                    <div className="col-span-1 md:col-span-2 flex justify-start md:justify-center items-center">
                      <StatusBadge status={kb.vectorStatus} />
                    </div>

                    {/* Actions */}
                    <div className="col-span-1 md:col-span-1 flex justify-end gap-2 opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDownload(kb)}
                        className="text-outline hover:text-primary transition-colors p-1 rounded hover:bg-surface-variant"
                        title="下载"
                      >
                        <Download className="w-[20px] h-[20px]" />
                      </button>
                      {kb.vectorStatus === 'FAILED' && (
                        <button
                          onClick={() => handleRevectorize(kb.id)}
                          disabled={revectorizing === kb.id}
                          className="text-outline hover:text-primary transition-colors p-1 rounded hover:bg-surface-variant disabled:opacity-50"
                          title="重新向量化"
                        >
                          <RefreshCw className={`w-[20px] h-[20px] ${revectorizing === kb.id ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteItem(kb)}
                        className="text-outline hover:text-error transition-colors p-1 rounded hover:bg-error-container"
                        title="删除"
                      >
                        <Trash2 className="w-[20px] h-[20px]" />
                      </button>
                    </div>
                  </motion.div>
                );
              })
            )}
          </div>

          {/* Pagination */}
          {!loading && knowledgeBases.length > 0 && (
            <div className="mt-auto px-6 py-4 bg-surface-container-low border-t border-outline-variant/30 flex items-center justify-between">
              <span className="font-body-md text-body-md text-on-surface-variant">
                共 {stats?.totalCount ?? knowledgeBases.length} 条数据
              </span>
              <div className="flex items-center gap-2">
                <button className="px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed font-label-md text-label-md transition-colors flex items-center gap-1">
                  <ChevronLeft className="w-[18px] h-[18px]" />
                  上一页
                </button>
                <button className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center font-label-md text-label-md">
                  1
                </button>
                <button className="w-8 h-8 rounded-lg text-on-surface hover:bg-surface-container flex items-center justify-center font-label-md text-label-md transition-colors">
                  2
                </button>
                <button className="w-8 h-8 rounded-lg text-on-surface hover:bg-surface-container flex items-center justify-center font-label-md text-label-md transition-colors">
                  3
                </button>
                <span className="text-on-surface-variant px-1">...</span>
                <button className="px-3 py-1.5 rounded-lg border border-outline-variant text-on-surface hover:bg-surface-container disabled:opacity-50 disabled:cursor-not-allowed font-label-md text-label-md transition-colors flex items-center gap-1">
                  下一页
                  <ChevronRight className="w-[18px] h-[18px]" />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Delete Confirm Dialog */}
      <DeleteConfirmDialog
        open={deleteItem !== null}
        item={deleteItem}
        itemType="知识库"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setDeleteItem(null)}
      />
    </div>
  );
}
