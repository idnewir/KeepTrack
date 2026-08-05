export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="kt-footer">
      © {year} Keep Track. All rights reserved.
    </footer>
  )
}
