export default function LoadingSpinner({ size = 'md', className = '' }) {
  const sizes = { sm: 'h-6 w-6', md: 'h-10 w-10', lg: 'h-14 w-14' }
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <div className={`animate-spin rounded-full border-t-2 border-b-2 border-brand ${sizes[size]}`} />
    </div>
  )
}
