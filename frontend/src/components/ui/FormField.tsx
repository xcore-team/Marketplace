interface FormFieldProps {
  label?: string            
  error?: string           
  hint?: string             
  required?: boolean        
  children: React.ReactNode 
}


export default function FormField({
  label,
  error,
  hint,
  required = false,
  children,
}: FormFieldProps) {
  return (
    <div className="flex flex-col gap-1.5 w-full">

      {label && (
        <label className="text-sm font-medium text-gray-300 tracking-wide">
          {label}
          {required && (
            <span className="text-red-400 ml-1" aria-hidden="true">*</span>
          )}
        </label>
      )}

      {children}

      {error ? (
        <p className="text-xs text-red-400 pl-0.5" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-gray-500 pl-0.5">
          {hint}
        </p>
      ) : null}

    </div>
  )
}