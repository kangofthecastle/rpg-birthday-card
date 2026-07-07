import { recipientPcActivity } from './recipientPcActivity';
import type { ActivityModule } from './activityTypes';
import { finalKeepsakeActivity } from './finalKeepsakeActivity';
import { friendoneFishingActivity } from './friendoneFishing/friendoneFishingActivity';
import { valorantSplitActivity } from './valorantSplit/valorantSplitActivity';

const ACTIVITIES: readonly ActivityModule[] = [
  friendoneFishingActivity,
  valorantSplitActivity,
  finalKeepsakeActivity,
  recipientPcActivity,
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
