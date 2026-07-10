import type { ActivityModule } from './activityTypes';
import { finalKeepsakeActivity } from './finalKeepsakeActivity';
import { foldTheLettersActivity } from './foldTheLetters/foldTheLettersActivity';
import { friendoneFishingActivity } from './friendoneFishing/friendoneFishingActivity';
import { valorantSplitActivity } from './valorantSplit/valorantSplitActivity';
import { violinActivity } from './violin/violinActivity';

const ACTIVITIES: readonly ActivityModule[] = [
  friendoneFishingActivity,
  valorantSplitActivity,
  finalKeepsakeActivity,
  foldTheLettersActivity,
  violinActivity,
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
