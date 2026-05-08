import type { ActivityModule } from './activityTypes';
import { finalKeepsakeActivity } from './finalKeepsakeActivity';
import { friendAActivity } from './friendAActivity';
import { friendBActivity } from './friendBActivity';
import { friendCActivity } from './friendCActivity';

const ACTIVITIES: readonly ActivityModule[] = [
  friendAActivity,
  friendBActivity,
  friendCActivity,
  finalKeepsakeActivity,
];

export function listActivities(): readonly ActivityModule[] {
  return ACTIVITIES;
}

export function getActivity(activityId: string): ActivityModule {
  const activity = ACTIVITIES.find((candidate) => candidate.id === activityId);

  if (!activity) {
    throw new Error(`Unknown activity: ${activityId}`);
  }

  return activity;
}
