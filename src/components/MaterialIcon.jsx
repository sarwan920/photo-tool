import React from 'react';

export default function MaterialIcon({ name, size = 18, className = '', style = {} }) {
  return (
    <span 
      className={`material-icons ${className}`} 
      style={{ 
        fontSize: size, 
        width: size, 
        height: size, 
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        userSelect: 'none',
        flexShrink: 0,
        ...style 
      }}
    >
      {name}
    </span>
  );
}
