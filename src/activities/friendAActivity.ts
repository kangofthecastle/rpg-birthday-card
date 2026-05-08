import type { ActivityModule } from './activityTypes';

export const friendAActivity: ActivityModule = {
  id: 'friend-a-memory-bloom',
  title: 'Memory Bloom',
  start({ mount, onComplete }) {
    mount.innerHTML = `
      <section class="activity-panel" role="dialog" aria-label="Memory Bloom">
        <h2>Memory Bloom</h2>
        <p>Choose the bloom that feels like it has been waiting for her.</p>
        <div class="activity-actions">
          <button type="button" data-activity-complete>Pick the warm little flower</button>
        </div>
      </section>
    `;

    mount
      .querySelector('[data-activity-complete]')
      ?.addEventListener('click', () =>
        onComplete({ locationId: 'friend-a', keepsakeId: 'pressed-flower' }),
        { once: true },
      );
  },
};
