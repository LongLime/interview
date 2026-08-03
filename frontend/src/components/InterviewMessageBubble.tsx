import { motion } from 'framer-motion';
import { User } from 'lucide-react';
import type { ReactNode } from 'react';

export type InterviewMessageRole = 'interviewer' | 'user';

interface InterviewMessageBubbleProps {
  role: InterviewMessageRole;
  text: string;
  category?: string;
  highlight?: boolean;
  italic?: boolean;
  suffix?: ReactNode;
}

export default function InterviewMessageBubble({
  role,
  text,
  category,
  highlight = false,
  italic = false,
  suffix,
}: InterviewMessageBubbleProps) {
  if (role === 'interviewer') {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex items-start gap-3"
      >
        <div className="w-8 h-8 bg-primary-container/10 rounded-full flex items-center justify-center flex-shrink-0">
          <User className="w-4 h-4 text-primary-container" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-on-surface">面试官</span>
            {category && (
              <span className="px-2 py-0.5 bg-primary-container/10 text-primary-container text-xs rounded-full">
                {category}
              </span>
            )}
          </div>
          <div
            className={`rounded-xl rounded-tl-none p-4 leading-relaxed ${
              highlight
                ? 'bg-surface-container-high border border-primary-container/20 text-on-surface'
                : 'bg-surface-container-high text-on-surface'
            } ${italic ? 'italic' : ''}`}
          >
            {text}
            {suffix}
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 justify-end"
    >
      <div className="flex-1 max-w-[80%]">
        <div
          className={`rounded-xl rounded-tr-none p-4 leading-relaxed bg-primary-container text-white ${
            highlight ? 'border border-primary-container bg-primary-container' : ''
          } ${italic ? 'italic' : ''}`}
        >
          {text}
          {suffix}
        </div>
      </div>
      <div className="w-8 h-8 bg-surface-container rounded-full flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-on-surface-variant" viewBox="0 0 24 24" fill="none">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="2" />
        </svg>
      </div>
    </motion.div>
  );
}
