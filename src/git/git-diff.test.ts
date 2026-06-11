import { jest } from '@jest/globals';

const mockContainer = {
  from: jest.fn().mockReturnThis(),
  withDirectory: jest.fn().mockReturnThis(),
  withWorkdir: jest.fn().mockReturnThis(),
  withExec: jest.fn().mockReturnThis(),
  stdout: jest.fn().mockResolvedValue('file1.txt\nfile2.txt\n\n  \nfile3.ts  \n'),
};

const mockDag = {
  container: jest.fn().mockReturnValue(mockContainer),
};

jest.unstable_mockModule('@dagger.io/dagger', () => {
  return {
    dag: mockDag,
    Directory: jest.fn(),
    Container: jest.fn(),
  };
});

// Important: import modules AFTER the mock
const { gitDiffStaged, gitDiffPrevious, gitDiffBetweenCommits } = await import('./git-diff.js');
const { dag, Directory, Container } = await import('@dagger.io/dagger');

describe('git-diff', () => {
  let mockSource: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSource = {} as any;
  });

  describe('gitDiffStaged', () => {
    it('should split stdout into an array of trimmed, non-empty file paths', async () => {
      const files = await gitDiffStaged(mockSource);
      expect(files).toEqual(['file1.txt', 'file2.txt', 'file3.ts']);

      expect(mockDag.container).toHaveBeenCalled();
      expect(mockContainer.withExec).toHaveBeenCalledWith([
        'git',
        'diff',
        '--cached',
        '--name-only',
        '--diff-filter=ACMR',
      ]);
    });

    it('should use provided container if given', async () => {
      const customContainer = {
        withExec: jest.fn().mockReturnThis(),
        stdout: jest.fn().mockResolvedValue('custom.txt\n'),
      } as any;

      const files = await gitDiffStaged(mockSource, customContainer);
      expect(files).toEqual(['custom.txt']);
      expect(customContainer.withExec).toHaveBeenCalledWith([
        'git',
        'diff',
        '--cached',
        '--name-only',
        '--diff-filter=ACMR',
      ]);
      expect(mockDag.container).not.toHaveBeenCalled();
    });
  });

  describe('gitDiffPrevious', () => {
    it('should split stdout into an array of trimmed, non-empty file paths', async () => {
      const files = await gitDiffPrevious(mockSource);
      expect(files).toEqual(['file1.txt', 'file2.txt', 'file3.ts']);

      expect(mockDag.container).toHaveBeenCalled();
      expect(mockContainer.withExec).toHaveBeenCalledWith([
        'git',
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        'HEAD~1',
      ]);
    });

    it('should use provided container if given', async () => {
      const customContainer = {
        withExec: jest.fn().mockReturnThis(),
        stdout: jest.fn().mockResolvedValue('custom.txt\n'),
      } as any;

      const files = await gitDiffPrevious(mockSource, customContainer);
      expect(files).toEqual(['custom.txt']);
      expect(customContainer.withExec).toHaveBeenCalledWith([
        'git',
        'diff-tree',
        '--no-commit-id',
        '--name-only',
        '-r',
        'HEAD~1',
      ]);
      expect(mockDag.container).not.toHaveBeenCalled();
    });
  });

  describe('gitDiffBetweenCommits', () => {
    it('should split stdout into an array of trimmed, non-empty file paths', async () => {
      const files = await gitDiffBetweenCommits(mockSource, 'HEAD~2..HEAD');
      expect(files).toEqual(['file1.txt', 'file2.txt', 'file3.ts']);

      expect(mockDag.container).toHaveBeenCalled();
      expect(mockContainer.withExec).toHaveBeenCalledWith([
        'git',
        'diff',
        '--name-only',
        'HEAD~2..HEAD',
      ]);
    });

    it('should use provided container if given', async () => {
      const customContainer = {
        withExec: jest.fn().mockReturnThis(),
        stdout: jest.fn().mockResolvedValue('custom.txt\n'),
      } as any;

      const files = await gitDiffBetweenCommits(mockSource, 'HEAD~2..HEAD', customContainer);
      expect(files).toEqual(['custom.txt']);
      expect(customContainer.withExec).toHaveBeenCalledWith([
        'git',
        'diff',
        '--name-only',
        'HEAD~2..HEAD',
      ]);
      expect(mockDag.container).not.toHaveBeenCalled();
    });
  });
});
