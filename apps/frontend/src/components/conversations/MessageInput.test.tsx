import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MessageInput } from './MessageInput';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

type MessageInputProps = ComponentProps<typeof MessageInput>;

afterEach(() => {
  cleanup();
});

function renderMessageInput(overrides: Partial<MessageInputProps> = {}) {
  const props: MessageInputProps = {
    messageBody: 'hello world',
    onChangeMessageBody: vi.fn(),
    onSend: vi.fn(),
    sendingMessage: false,
    burnAfterReading: false,
    setBurnAfterReading: vi.fn(),
    burnDelay: 30,
    setBurnDelay: vi.fn(),
    timeLockEnabled: false,
    setTimeLockEnabled: vi.fn(),
    timeLockDate: '',
    setTimeLockDate: vi.fn(),
    timeLockTime: '',
    setTimeLockTime: vi.fn(),
    setTyping: vi.fn(),
    selectedFile: null,
    onAttachmentSelect: vi.fn(),
    onAttachmentClear: vi.fn(),
    ...overrides,
  };

  return { props, ...render(<MessageInput {...props} />) };
}

describe('MessageInput', () => {
  it('renders input and send button', () => {
    renderMessageInput();
    expect(screen.getByRole('textbox')).toBeTruthy();
  });

  it('calls onSend when send button is clicked', () => {
    const onSend = vi.fn();
    renderMessageInput({ onSend, messageBody: 'test message' });
    
    const sendButton = screen.getByRole('button', { name: /send/i });
    fireEvent.click(sendButton);
    
    expect(onSend).toHaveBeenCalled();
  });

  it('disables send button when sendingMessage is true', () => {
    renderMessageInput({ sendingMessage: true, messageBody: 'test' });
    
    // When sending, button shows "WAIT" and is disabled
    const sendButton = screen.getByRole('button', { name: /wait/i });
    expect((sendButton as HTMLButtonElement).disabled).toBe(true);
  });
});
