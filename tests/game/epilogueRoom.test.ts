import { describe, expect, it } from 'vitest';
import {
  BOAT_PHOTO_FRAME,
  resolveEpilogueBeamBands,
  resolveEpiloguePhotoPlacement,
  resolveEpilogueRoomAnchors,
  resolveShearedCanvasSize,
  resolveShearedWindowLightOpening,
} from '../../src/game/epilogueRoom';

describe('epilogueRoom', () => {
  const placements = [
    { frame: 'window', mapX: 300, mapY: 180 },
    { frame: 'window', mapX: 500, mapY: 80 },
    { frame: 'desk', mapX: 700, mapY: 790 },
    { frame: 'photoWall', mapX: 1160, mapY: 134 },
  ] as const;

  it('resolves the desk, photo wall, and higher of two windows', () => {
    const anchors = resolveEpilogueRoomAnchors(placements);
    expect(anchors.desk?.frame).toBe('desk');
    expect(anchors.photoWall?.frame).toBe('photoWall');
    expect(anchors.highWindow?.mapY).toBe(80);
    expect(anchors.lowWindow?.mapY).toBe(180);
  });

  it('keeps the completed boat-photo rectangle inside the photo-wall crop', () => {
    expect(BOAT_PHOTO_FRAME.x).toBeGreaterThanOrEqual(0);
    expect(BOAT_PHOTO_FRAME.y).toBeGreaterThanOrEqual(0);
    expect(BOAT_PHOTO_FRAME.x + BOAT_PHOTO_FRAME.width).toBeLessThanOrEqual(1);
    expect(BOAT_PHOTO_FRAME.y + BOAT_PHOTO_FRAME.height).toBeLessThanOrEqual(1);
  });

  it('maps the photo into the empty frame with the wall exact 0.5 shear', () => {
    const placement = resolveEpiloguePhotoPlacement({ x: 100, y: 200, width: 716, height: 838 });
    expect(placement).toMatchObject({
      centerX: 452,
      centerY: 557,
      displayWidth: 120,
      displayHeight: 214,
      corners: {
        topLeft: { x: 392, y: 450 },
        topRight: { x: 512, y: 510 },
        bottomRight: { x: 512, y: 664 },
        bottomLeft: { x: 392, y: 604 },
      },
    });
    const top = placement.corners;
    expect((top.topRight.y - top.topLeft.y) / (top.topRight.x - top.topLeft.x)).toBe(0.5);
  });

  it('allocates the cropped wall photo without clipping its positive shear', () => {
    expect(resolveShearedCanvasSize(480, 616, 0.5)).toEqual({ width: 480, height: 856 });
  });

  it('widens nested beam bands from the high-window opening into the frame', () => {
    const source = resolveShearedWindowLightOpening(
      { x: 20, y: 30, width: 171, height: 329 },
      -0.5,
    );
    expect(source.start.y).toBeGreaterThan(source.end.y);
    expect(source.start.y).toBeLessThan(359);

    const photo = resolveEpiloguePhotoPlacement({ x: 100, y: 200, width: 716, height: 838 });
    const bands = resolveEpilogueBeamBands(source, photo.corners);
    expect(bands).toHaveLength(3);
    const targetWidths = bands.map((band) => Math.hypot(
      band.target.end.x - band.target.start.x,
      band.target.end.y - band.target.start.y,
    ));
    const sourceWidths = bands.map((band) => Math.hypot(
      band.source.end.x - band.source.start.x,
      band.source.end.y - band.source.start.y,
    ));
    expect(targetWidths[0]).toBeGreaterThan(targetWidths[1]);
    expect(targetWidths[1]).toBeGreaterThan(targetWidths[2]);
    expect(targetWidths.every((width, index) => width > sourceWidths[index]!)).toBe(true);
    expect(bands[0]?.target.start.y).toBeLessThan(photo.corners.bottomLeft.y);
    expect(bands[0]?.target.end.y).toBeLessThan(photo.corners.bottomRight.y);
  });
});
