// frontend/src/components/interviewschedule/ScheduleHeader.tsx

import React from 'react';
import { motion } from 'framer-motion';
import { Plus, ChevronLeft, ChevronRight, Calendar, List, LayoutGrid } from 'lucide-react';
import dayjs from 'dayjs';

interface ScheduleHeaderProps {
  view: 'day' | 'week' | 'month' | 'list';
  onViewChange: (view: 'day' | 'week' | 'month' | 'list') => void;
  date: Date;
  onDateChange: (date: Date) => void;
  onAddClick: () => void;
}

export const ScheduleHeader: React.FC<ScheduleHeaderProps> = ({
  view,
  onViewChange,
  date,
  onDateChange,
  onAddClick,
}) => {
  const handlePrevious = () => {
    const newDate = new Date(date);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() - 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() - 7);
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() - 1);
    }
    onDateChange(newDate);
  };

  const handleNext = () => {
    const newDate = new Date(date);
    if (view === 'day') {
      newDate.setDate(newDate.getDate() + 1);
    } else if (view === 'week') {
      newDate.setDate(newDate.getDate() + 7);
    } else if (view === 'month') {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    onDateChange(newDate);
  };

  const handleToday = () => {
    onDateChange(new Date());
  };

  const getTitle = () => {
    if (view === 'list') {
      return '面试列表';
    }
    return dayjs(date).format(view === 'month' ? 'YYYY年MM月' : 'YYYY年MM月DD日');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-surface backdrop-blur-xl rounded-xl border border-outline-variant p-6 mb-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-6">
          <motion.h2
            key={getTitle()}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-2xl font-display font-bold text-on-surface tracking-tight"
          >
            {getTitle()}
          </motion.h2>

          {view !== 'list' && (
            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handlePrevious}
                className="p-2.5 rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors"
                title="上一页"
              >
                <ChevronLeft className="w-5 h-5" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleToday}
                className="px-4 py-2 text-sm font-medium rounded-xl bg-primary-container/10 text-on-primary-container hover:bg-primary-container/20 border border-outline-variant backdrop-blur-sm transition-all"
              >
                今天
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleNext}
                className="p-2.5 rounded-xl text-on-surface-variant hover:bg-surface-container-high transition-colors"
                title="下一页"
              >
                <ChevronRight className="w-5 h-5" />
              </motion.button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-surface-container-high backdrop-blur-sm rounded-xl p-1.5 gap-1">
            {[
              { key: 'day', icon: Calendar, label: '日视图' },
              { key: 'week', icon: Calendar, label: '周视图' },
              { key: 'month', icon: LayoutGrid, label: '月视图' },
              { key: 'list', icon: List, label: '列表' },
            ].map(({ key, icon: Icon, label }) => (
              <motion.button
                key={key}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onViewChange(key as any)}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 font-medium text-sm transition-all ${
                  view === key
                    ? 'bg-surface backdrop-blur-sm shadow-md text-primary-container border border-outline-variant'
                    : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </motion.button>
            ))}
          </div>

          <motion.button
            whileHover={{ scale: 1.05, y: -1 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAddClick}
            className="px-5 py-2.5 bg-primary-container text-on-primary rounded-xl font-medium shadow-sm hover:shadow-lg hover:-translate-y-0.5 flex items-center gap-2 transition-all"
          >
            <Plus className="w-4 h-4" />
            添加面试
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
};
