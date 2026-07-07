import type { ActivityModule } from './activityTypes';

export const finalKeepsakeActivity: ActivityModule = {
  id: 'final-keepsake-reveal',
  title: 'Lantern Reveal',
  start({ mount, onComplete }) {
    mount.innerHTML = `
      <section class="activity-panel activity-panel--final" role="dialog" aria-label="Lantern Reveal">
        <h2>Lantern Reveal</h2>
        <p>The koi scale and star fit together around the lantern.</p>
        <div class="activity-actions">
          <button type="button" data-activity-complete>Light the lantern</button>
        </div>
      </section>
    `;

    mount
      .querySelector('[data-activity-complete]')
      ?.addEventListener('click', () =>
        onComplete({ locationId: 'final-spot', keepsakeId: 'ending-light' }),
        { once: true },
      );
  },
};
