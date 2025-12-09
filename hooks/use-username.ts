import { nanoid } from "nanoid"
import { useEffect, useState } from "react"

const ANIMALS = [
    'warthog',
    'pig',
    'hippo',
    'hyena',
    'fox',
    'hawk',
    'lion',
    'maggot',
    'mosquito',
    'firefly',
    'butterfly',
    'elephant',
    'leopard',
    'horse'
]

const STORAGE_KEY = 'chat_username'

const generateUsername = () => {
    const word = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
    return `anonymous-${word}-${nanoid(5)}`
}

export const useUsername = () => {
    const [username, setUsername] = useState("")

    useEffect(() => {
        const main = () => {
            const stored = localStorage.getItem(STORAGE_KEY)

            if (stored) {
                setUsername(stored)
            }

            const generated = generateUsername()
            localStorage.setItem(STORAGE_KEY, generated)
            setUsername(generated)
        }
        main()
    }, [])

    return { username }
}