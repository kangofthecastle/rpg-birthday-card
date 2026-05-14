import type { ActivityModule } from './activityTypes';
import { friendthreeStrategyActivity } from './friendthreeStrategyActivity';
import { finalKeepsakeActivity } from './finalKeepsakeActivity';
import { friendBActivity } from './friendBActivity';
import { friendCActivity } from './friendCActivity';
import { friendoneFishingActivity } from './friendoneFishing/friendoneFishingActivity';

const ACTIVITIES: readonly ActivityModule[] = [
  friendoneFishingActivity,
  friendBActivity,
  friendCActivity,
  friendthreeStrategyActivity,
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
