// frontend/src/components/interviewschedule/ScheduleList.tsx

import React from 'react';
import { motion } from 'framer-motion';
import type { InterviewSchedule, InterviewStatus } from '../../types/interviewSchedule';
import { InterviewListItem } from './InterviewListItem';

interface ScheduleListProps {
  interviews: InterviewSchedule[];
  onEdit: (interview: InterviewSchedule) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: InterviewStatus) => void;
}

export const ScheduleList: React.FC<ScheduleListProps> = ({
  interviews = [],
  onEdit,
  onDelete,
  onStatusChange,
}) => {
  const sortedInterviews = [...interviews].sort(
    (a, b) => new Date(a.interviewTime).getTime() - new Date(b.interviewTime).getTime()
  );

  if (sortedInterviews.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center py-16"
      >
        <div className="bg-surface backdrop-blur-xl rounded-xl border border-outline-variant p-12 shadow-sm">
          <p className="text-outline text-lg font-medium">暂无面试记录</p>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="bg-surface backdrop-blur-xl rounded-xl border border-outline-variant p-6 space-y-4">
      {sortedInterviews.map((interview, index) => (
        <motion.div
          key={interview.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: index * 0.05 }}
        >
          <InterviewListItem
            interview={interview}
            onEdit={() => onEdit(interview)}
            onDelete={() => onDelete(interview.id)}
            onStatusChange={(status) => onStatusChange(interview.id, status)}
          />
        </motion.div>
      ))}
    </div>
  );
};
