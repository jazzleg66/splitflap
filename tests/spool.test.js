import { SPOOL, isColorChar, COLOR_MAP, initGrid, setTargets, snapToTargets, stepAll, spoolIndex, spoolChar, stepsToReach } from '../public/shared/spool.js';

describe('spool module', () => {
    it('isColorChar returns correctly', () => {
        expect(isColorChar('r')).toBe(true);
        expect(isColorChar('A')).toBe(false);
    });

    it('has COLOR_MAP setup', () => {
        expect(COLOR_MAP.r).toBe('#B34444');
    });

    it('initGrid creates logical grid', () => {
        const grid = initGrid(6, 22);
        expect(grid.length).toBe(6);
        expect(grid[0].length).toBe(22);
        expect(grid[0][0]).toEqual({ current: ' ', target: ' ', stepsLeft: 0 });
    });

    it('setTargets assigns attributes', () => {
        const grid = initGrid(1, 1);
        setTargets(grid, ['A']);
        const tile = grid[0][0];
        expect(tile.target).toBe('A');
    });

    it('snapToTargets snaps directly', () => {
        const grid = initGrid(1, 1);
        grid[0][0].target = 'B';
        snapToTargets(grid);
        expect(grid[0][0].current).toBe('B');
    });

    it('stepAll advances tiles correctly', () => {
        const grid = initGrid(1, 1);
        setTargets(grid, ['A']);
        let result = stepAll(grid);
        expect(result.anyChanged).toBe(true);
        expect(grid[0][0].current).toBe('A');

        result = stepAll(grid);
        expect(result.anyChanged).toBe(false);
        expect(result.allSettled).toBe(true);
    });

    it('spoolIndex returns correct index', () => {
        expect(spoolIndex('A')).toBe(1);
        expect(spoolIndex('unknown_char')).toBe(0);
    });

    it('spoolChar returns correct character', () => {
        expect(spoolChar(1)).toBe('A');
        expect(spoolChar(-1)).toBe('p');
    });

    it('stepsToReach calculates correctly', () => {
        expect(stepsToReach(' ', 'A')).toBe(1);
        expect(stepsToReach('A', ' ')).toBe(SPOOL.length - 1);
        expect(stepsToReach('A', 'A')).toBe(0);
    });
});
