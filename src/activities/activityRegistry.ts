import type { ActivityModule } from './activityTypes';
import { finalKeepsakeActivity } from './finalKeepsakeActivity';
import { friendBActivity } from './friendBActivity';
import { friendoneFishingActivity } from './friendoneFishing/friendoneFishingActivity';

const ACTIVITIES: readonly ActivityModule[] = [
  friendoneFishingActivity,
  friendBActivity,
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
