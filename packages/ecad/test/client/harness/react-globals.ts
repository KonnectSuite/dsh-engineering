/**
 * The screenshot harness's React globals.
 *
 * The committed face bundle externalises React (the shell's module table serves
 * it). For the harness, one small IIFE imports a matching React + ReactDOM pair
 * and exposes them on the page so the harness's `require` stub can hand them to
 * the real registration. Not part of the product.
 */
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import * as jsxRuntime from 'react/jsx-runtime'

const target = window as unknown as { __HARNESS_REACT__?: unknown }
target.__HARNESS_REACT__ = {
  react: React,
  reactDom: { createRoot },
  jsxRuntime,
}
