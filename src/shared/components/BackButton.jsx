import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import './BackButton.css';

/**
 * Reusable back button component with consistent styling across all pages.
 * 
 * @param {string} to - The URL to navigate to when clicked
 * @param {string} [label] - Optional label text (hidden visually, used for aria-label)
 * @param {string} [className] - Additional CSS classes
 * @param {string} [size] - Size variant: 'sm' (32px), 'md' (36px), or 'lg' (40px)
 * @param {boolean} [showLabel] - Whether to show text label alongside icon
 */
function BackButton({ to, label = 'Go back', className = '', size = 'md', showLabel = false }) {
  const sizeClass = size === 'sm' ? 'back-btn-sm' : size === 'lg' ? 'back-btn-lg' : 'back-btn-md';
  
  return (
    <Link 
      to={to} 
      className={`back-button ${sizeClass} ${className}`}
      aria-label={label}
    >
      <ArrowLeft size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} />
      {showLabel && <span className="back-button-label">{label}</span>}
    </Link>
  );
}

export default BackButton;