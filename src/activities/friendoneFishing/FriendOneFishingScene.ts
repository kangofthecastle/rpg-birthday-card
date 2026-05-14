import * as Phaser from 'phaser';

export class FriendOneFishingScene extends Phaser.Scene {
  constructor() {
    super('FriendOneFishingScene');
  }

  create(): void {
    const centerX = this.scale.width / 2;
    const centerY = this.scale.height / 2;

    this.add
      .text(centerX, centerY, '____ Fishing', {
        color: '#ffffff',
        fontFamily: 'sans-serif',
        fontSize: '32px',
      })
      .setOrigin(0.5);
  }
}
