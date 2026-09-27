'use client';

import React from 'react';
import { CardActivity } from '@/types';
import { Clock, ArrowRight, PlusCircle, Edit3, User as UserIcon } from 'lucide-react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ActivityTimelineProps {
  activities: CardActivity[];
}

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ activities }) => {
  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-6 text-slate-500 text-sm">
        Nenhuma atividade registrada ainda.
      </div>
    );
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'PHASE_CHANGE':
        return <ArrowRight className="w-4 h-4 text-purple-600" />;
      case 'CARD_CREATED':
        return <PlusCircle className="w-4 h-4 text-emerald-600" />;
      case 'FIELD_UPDATED':
        return <Edit3 className="w-4 h-4 text-blue-600" />;
      default:
        return <Clock className="w-4 h-4 text-slate-600" />;
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = parseISO(dateStr);
      return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="flow-root">
      <ul className="-mb-8">
        {activities.map((activity, idx) => {
          let metadataObj: any = null;
          if (activity.metadata) {
            try {
              metadataObj = JSON.parse(activity.metadata);
            } catch {
              metadataObj = null;
            }
          }

          return (
            <li key={activity.id}>
              <div className="relative pb-8">
                {idx !== activities.length - 1 ? (
                  <span
                    className="absolute top-4 left-4 -ml-px h-full w-0.5 bg-slate-200 dark:bg-slate-800"
                    aria-hidden="true"
                  />
                ) : null}

                <div className="relative flex space-x-3 items-start">
                  <div>
                    <span className="h-8 w-8 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center ring-4 ring-white dark:ring-slate-900">
                      {getActivityIcon(activity.type)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {activity.user ? (
                          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1">
                            {activity.user.avatar ? (
                              <img
                                src={activity.user.avatar}
                                alt={activity.user.name}
                                className="w-4 h-4 rounded-full"
                              />
                            ) : (
                              <UserIcon className="w-3.5 h-3.5" />
                            )}
                            {activity.user.name}
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-slate-500">Sistema</span>
                        )}
                      </div>
                      <span className="text-xs text-slate-400">
                        {formatDate(activity.createdAt)}
                      </span>
                    </div>

                    <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                      {activity.description}
                    </p>

                    {metadataObj && metadataObj.fromPhase && metadataObj.toPhase && (
                      <div className="mt-1.5 flex items-center gap-2 text-xs">
                        <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                          {metadataObj.fromPhase}
                        </span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        <span className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold">
                          {metadataObj.toPhase}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
