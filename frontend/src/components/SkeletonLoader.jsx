import React from 'react'

export const SkeletonLoader = ({ type = 'card', count = 1 }) => {
  const list = Array.from({ length: count })

  const draw = () => {
    if (type === 'card') {
      return (
        <div className="glass-card p-4 rounded h-28 animate-pulse flex flex-col justify-between">
          <div className="h-3 bg-white/10 rounded w-1/3" />
          <div className="h-7 bg-white/10 rounded w-1/2" />
          <div className="h-2 bg-white/10 rounded w-2/3" />
        </div>
      )
    }
    if (type === 'chart') {
      return (
        <div className="glass-card p-4 rounded h-72 animate-pulse flex flex-col justify-between">
          <div className="h-4 bg-white/10 rounded w-1/4" />
          <div className="h-44 bg-white/4 rounded w-full" />
          <div className="h-3 bg-white/10 rounded w-full" />
        </div>
      )
    }
    if (type === 'row') {
      return (
        <div className="flex items-center justify-between py-2.5 border-b border-white/5 animate-pulse">
          <div className="h-3 bg-white/10 rounded w-1/4" />
          <div className="h-3 bg-white/10 rounded w-1/6" />
          <div className="h-3 bg-white/10 rounded w-1/5" />
        </div>
      )
    }
    return <div className="h-3.5 bg-white/10 rounded animate-pulse w-full my-1.5" />
  }

  return (
    <>
      {list.map((_, i) => (
        <React.Fragment key={i}>
          {draw()}
        </React.Fragment>
      ))}
    </>
  )
}

export default SkeletonLoader
