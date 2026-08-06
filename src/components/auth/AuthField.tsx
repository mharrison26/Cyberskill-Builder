import { cn } from '@/lib/utils';

type AuthFieldProps = {
  id: string;
  label: string;
  type: 'email' | 'password' | 'text';
  name: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  autoComplete?: string;
  disabled?: boolean;
};

export function AuthField({
  id,
  label,
  type,
  name,
  value,
  onChange,
  error,
  autoComplete,
  disabled,
}: AuthFieldProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        aria-describedby={errorId}
        className={cn(
          'mt-1 block w-full rounded-md border px-3 py-2 text-sm text-gray-900 shadow-sm',
          'placeholder:text-gray-400',
          'focus:outline-none focus:ring-2 focus:ring-offset-1',
          error
            ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
            : 'border-gray-300 focus:border-gray-900 focus:ring-gray-900',
          disabled && 'cursor-not-allowed bg-gray-100 opacity-70'
        )}
      />
      {error ? (
        <p id={errorId} role="alert" className="mt-1 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
