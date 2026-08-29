import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18'
})

// Pricing plans — update with your real Stripe price IDs later
export const PLANS = {
  monthly: {
    name: 'Monthly',
    price: 29,
    interval: 'month',
    priceId: process.env.STRIPE_MONTHLY_PRICE_ID || 'price_monthly',
    features: ['Unlimited interviews', 'AI answers', 'Voice recognition', 'Priority support']
  },
  yearly: {
    name: 'Yearly',
    price: 199,
    interval: 'year',
    priceId: process.env.STRIPE_YEARLY_PRICE_ID || 'price_yearly',
    features: ['Everything in Monthly', 'Save 40%', 'Early access features']
  },
  lifetime: {
    name: 'Lifetime',
    price: 499,
    interval: null,
    priceId: process.env.STRIPE_LIFETIME_PRICE_ID || 'price_lifetime',
    features: ['Everything forever', 'One-time payment', 'All future updates']
  }
}