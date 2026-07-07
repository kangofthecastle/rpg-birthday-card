import type { ActivityModule } from './activityTypes';

/**
 * ____'s PC, once both friend keepsakes are in hand. A brief transitional
 * panel that wakes the screen, then hands off to the reward letter (the
 * Golden Hour Photo) via the location's `rewardPresentation: 'letter'` path —
 * mirroring how ____'s fishing reward is presented.
 */
export const recipientPcActivity: ActivityModule = {
  id: 'recipient-pc-letter',
  title: 'Golden Hour',
  start({ mount, onComplete }) {
    mount.innerHTML = `
      <section class="activity-panel activity-panel--recipient-pc" role="dialog" aria-label="Golden Hour">
        <h2>Golden Hour</h2>
        <p>The monitor glows to life, warm as morning. A photo is loading.</p>
        <div class="activity-actions">
          <button type="button" data-activity-complete>Look closer</button>
        </div>
      </section>
    `;

    mount
      .querySelector('[data-activity-complete]')
      ?.addEventListener(
        'click',
        () => onComplete({ locationId: 'recipient-house', keepsakeId: 'golden-hour-photo' }),
        { once: true },
      );
  },
};
