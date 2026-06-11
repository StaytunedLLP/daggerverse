import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { checkPrTitleFromEvent } from './pr-checks.js';
import { File, Secret } from '@dagger.io/dagger';

describe('checkPrTitleFromEvent exception paths', () => {
    let mockFetch: any;
    let consoleWarnSpy: any;

    beforeEach(() => {
        mockFetch = vi.fn();
        global.fetch = mockFetch;
        consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should post a comment and re-throw error when title is invalid and githubToken is provided', async () => {
        const mockContent = JSON.stringify({
            pull_request: { title: 'invalid title', number: 42 },
            repository: { full_name: 'StaytunedLLP/test-repo' }
        });

        const mockFile = {
            contents: vi.fn().mockResolvedValue(mockContent),
        } as unknown as File;

        const mockSecret = {
            plaintext: vi.fn().mockResolvedValue('mock-token'),
        } as unknown as Secret;

        mockFetch.mockResolvedValueOnce({
            ok: true,
        });

        await expect(checkPrTitleFromEvent(mockFile, mockSecret)).rejects.toThrowError(/PR title "invalid title" is invalid/);

        expect(mockSecret.plaintext).toHaveBeenCalled();
        expect(mockFetch).toHaveBeenCalledWith(
            'https://api.github.com/repos/StaytunedLLP/test-repo/issues/42/comments',
            expect.objectContaining({
                method: 'POST',
                headers: {
                    Authorization: 'Bearer mock-token',
                    Accept: 'application/vnd.github+json',
                    'Content-Type': 'application/json',
                },
                body: expect.stringContaining('❌ **PR Title Validation Failed**')
            })
        );
        expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it('should warn when posting comment fails due to network/API error', async () => {
        const mockContent = JSON.stringify({
            pull_request: { title: 'invalid title', number: 42 },
            repository: { full_name: 'StaytunedLLP/test-repo' }
        });

        const mockFile = {
            contents: vi.fn().mockResolvedValue(mockContent),
        } as unknown as File;

        const mockSecret = {
            plaintext: vi.fn().mockResolvedValue('mock-token'),
        } as unknown as Secret;

        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 403,
            statusText: 'Forbidden',
            text: vi.fn().mockResolvedValue('Rate limit exceeded'),
        });

        await expect(checkPrTitleFromEvent(mockFile, mockSecret)).rejects.toThrowError(/PR title "invalid title" is invalid/);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            expect.stringContaining('Failed to post PR comment: GitHub API error: 403 Forbidden - Rate limit exceeded')
        );
    });

    it('should warn when pull_request.number or repository.full_name is missing and githubToken is provided', async () => {
        const mockContent = JSON.stringify({
            pull_request: { title: 'invalid title' },
            // missing repository and pull_request.number
        });

        const mockFile = {
            contents: vi.fn().mockResolvedValue(mockContent),
        } as unknown as File;

        const mockSecret = {
            plaintext: vi.fn().mockResolvedValue('mock-token'),
        } as unknown as Secret;

        await expect(checkPrTitleFromEvent(mockFile, mockSecret)).rejects.toThrowError(/PR title "invalid title" is invalid/);

        expect(consoleWarnSpy).toHaveBeenCalledWith(
            "Could not post PR comment: pull_request.number or repository.full_name missing in event file."
        );
        expect(mockFetch).not.toHaveBeenCalled();
    });
});
