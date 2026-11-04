import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CameraCapture } from '@/components/media/CameraCapture';
import { Modal } from '@/components/ui/Overlay';

/** jsdom has no camera: these tests stub navigator.mediaDevices to check our handling, not a real device. */
function stubCamera(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia: vi.fn(getUserMedia), enumerateDevices: vi.fn(async () => []) }, configurable: true });
}

describe('camera capture', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('explains a denied camera permission and points to the gallery', async () => {
    stubCamera(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    render(<CameraCapture open onClose={() => {}} onCapture={async () => null} />);
    expect(await screen.findByText(/Camera permission was denied/)).toBeInTheDocument();
    expect(screen.getByText(/upload a photo from your device instead/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('explains a missing camera', async () => {
    stubCamera(() => Promise.reject(new DOMException('none', 'NotFoundError')));
    render(<CameraCapture open onClose={() => {}} onCapture={async () => null} />);
    expect(await screen.findByText(/No camera was found/)).toBeInTheDocument();
  });

  it('stops every camera track when cancelled', async () => {
    const stop = vi.fn();
    stubCamera(async () => ({ getTracks: () => [{ stop }, { stop }] }) as unknown as MediaStream);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<CameraCapture open onClose={onClose} onCapture={async () => null} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalled());
    await screen.findByRole('button', { name: 'Capture' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(stop).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalled();
  });

  it('asks for the rear camera on phones', async () => {
    stubCamera(() => Promise.reject(new DOMException('denied', 'NotAllowedError')));
    render(<CameraCapture open onClose={() => {}} onCapture={async () => null} />);
    await waitFor(() => expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ facingMode: { ideal: 'environment' } }), audio: false })));
  });
});

describe('modal width', () => {
  afterEach(cleanup);
  it('uses the requested width instead of also applying the default one', () => {
    render(
      <Modal open onClose={() => {}} title="Wide" className="sm:max-w-6xl">
        <p>Body</p>
      </Modal>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('sm:max-w-6xl');
    expect(dialog.className).not.toContain('sm:max-w-lg');
  });
});
