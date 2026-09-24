import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatCard from './StatCard'

describe('StatCard', () => {
  it('renders label and value text', () => {
    render(<StatCard label="Active Clients" value="42" />)
    expect(screen.getByText('Active Clients')).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
  })

  it('renders an icon when passed', () => {
    const Icon = () => <svg data-testid="test-icon" className="h-5 w-5" />
    render(<StatCard label="Revenue" value="$1k" icon={Icon} />)
    expect(screen.getByTestId('test-icon')).toBeInTheDocument()
  })

  it('does not render an icon container glyph when icon is absent', () => {
    render(<StatCard label="Sessions" value="12" />)
    expect(screen.queryByTestId('test-icon')).not.toBeInTheDocument()
  })

  it('applies card color classes', () => {
    render(<StatCard label="Green" value="3" color="green" />)
    const badge = screen.getByText('Green').closest('.card').querySelector('.rounded-lg')
    expect(badge.className).toContain('bg-success/12')
    expect(badge.className).toContain('text-success')
    expect(badge.className).toContain('ring-success/25')
  })
})