// /components/StarField.js
import { useLoader } from '@react-three/fiber'
import { Points, PointMaterial } from '@react-three/drei'
import { useEffect, useState } from 'react'
import Papa from 'papaparse'

export default function StarField() {
  const [stars, setStars] = useState([])

  useEffect(() => {
    // Fetch HYG CSV
    fetch('/hygdata_v3.csv')
      .then(res => res.text())
      .then(text => {
        Papa.parse(text, {
          header: true,
          complete: results => {
            // Convert XYZ to array of positions
            const points = results.data.map(star => [
              parseFloat(star.x),
              parseFloat(star.y),
              parseFloat(star.z)
            ])
            setStars(points)
          }
        })
      })
  }, [])

  return (
    <Points positions={stars} limit={10000}> {/* You can adjust the number for performance */}
      <PointMaterial color="white" size={0.5} sizeAttenuation={true} />
    </Points>
  )
}
