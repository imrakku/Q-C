import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../../utils/logger'; // Assuming LogEntry type is exported

interface LogPanelProps {
  logEntries: LogEntry[];
  heightClass?: string; // e.g., 'h-40', 'h-60'
  title?: string;
}

const LogPanel: React.FC<LogPanelProps> = ({ logEntries, heightClass = 'h-60', title }) => {
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Scroll to the bottom when new log entries are added
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logEntries]);

  return (
    <div className="mt-4">
      {title && <h3 className="text-lg font-semibold text-slate-700 mb-2">{title}</h3>}
      <div className={`log-panel ${heightClass} styled-scrollbar`}>
        {logEntries.length === 0 && (
          <p className="text-slate-500 italic p-2">
            {`[SYS_LOG] Log empty. ${title ? title + ' ' : ''}events will appear here.`}
          </p>
        )}
        {logEntries.map(entry => (
          <p key={entry.id} dangerouslySetInnerHTML={{ __html: entry.message }} />
        ))}
        <div ref={logEndRef} /> {/* Invisible element to scroll to */}
      </div>
    </div>
  );
};

export default LogPanel;
