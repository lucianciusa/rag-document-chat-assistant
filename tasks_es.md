# Aplicación RAG con Subida de Documentos y Chat Interactivo

En esta práctica construirás una **aplicación completa de RAG (Retrieval-Augmented Generation)** que permita subir documentos en múltiples formatos y consultarlos mediante un chat inteligente. La práctica integra todos los conceptos vistos hasta ahora: embeddings, búsqueda vectorial, semantic ranking y generación de respuestas fundamentadas.

**🎯 Objetivo General:**  
Desarrollar una aplicación funcional que permita a usuarios cargar documentos (PDF, DOCX, PPT, imágenes, etc.), procesarlos automáticamente en un índice de Azure AI Search, y realizar consultas mediante chat con memoria conversacional y respuestas fundamentadas (grounding).

**⏱️ Tiempo estimado:** 2-3 días

**📋 Formato de entrega:**
- Repositorio de GitHub con código fuente completo
- README con explicación detallada de la arquitectura implementada
- Video demo (3-5 minutos) mostrando la aplicación funcionando

**🎤 Exposición:**  
Se elegirán alumnos al azar para que presenten su solución al resto de la clase, explicando decisiones técnicas y demostrando la aplicación.

---

## Parte Única: Implementación Completa del Sistema RAG

**Objetivo:** Construir de principio a fin una aplicación RAG que permita subir documentos, procesarlos automáticamente, y chatear con el contenido indexado.

### 📌 Requisitos Funcionales Obligatorios

Tu aplicación **DEBE implementar** las siguientes funcionalidades:

#### 1. **📁 Subida y Procesamiento de Documentos**

Tu sistema debe permitir cargar documentos en múltiples formatos:
- ✅ PDF
- ✅ DOCX (Microsoft Word)
- ✅ PPTX (Microsoft PowerPoint)
- ✅ Imágenes (PNG, JPG, etc.)
- ✅ Cualquier otro formato que consideres relevante

**Procesamiento requerido:**
- **Chunking:** Dividir documentos en fragmentos adecuados
- **Generación de embeddings:** Vectorizar cada chunk usando modelos de Azure OpenAI
- **Indexación:** Almacenar en Azure AI Search con campos vectoriales y metadata
- **Gestión de errores:** Manejo robusto de archivos corruptos o formatos no soportados

#### 2. **🔍 Índice de Azure AI Search**

Debes configurar un índice en Azure AI Search que incluya:
- Campos de contenido (texto)
- Campos vectoriales (embeddings)
- Metadata relevante (nombre archivo, fecha subida, tipo, etc.)
- Configuración de semantic ranking
- Configuración para búsqueda híbrida (vectorial + keyword)

#### 3. **💬 Chat con RAG**

Implementar un sistema de chat que:
- **Retrieve:** Busque información relevante en el índice usando búsqueda híbrida
- **Augment:** Construya prompts enriquecidos con el contexto recuperado
- **Generate:** Genere respuestas usando un LLM (GPT-4, GPT-4o, etc.)
- **Grounding:** Las respuestas deben estar fundamentadas en los documentos indexados
- **Citations:** Incluir referencias a las fuentes utilizadas

#### 4. **🧠 Memoria Conversacional**

El chat debe mantener contexto entre mensajes:
- Persistir historial de conversación
- Usar el historial para entender preguntas de seguimiento
- Permitir que el usuario reinicie/limpie la conversación

#### 5. **🖥️ Frontend y Backend**

**Frontend:**
- Puede ser Streamlit, Gradio, o cualquier framework simple
- No se evaluará la estética, sino la funcionalidad
- Debe permitir: subir archivos, ver documentos cargados, chatear

**Backend:**
- API REST, FastAPI, Flask, o arquitectura de tu elección
- Separación clara de responsabilidades
- Manejo de errores y logging

### 🚫 Restricciones Importantes

- ❌ **NO se pueden usar agentes** (ni Azure AI Agent Service, ni frameworks como AutoGen/CrewAI)
- ✅ **Arquitectura completamente libre** - Elige las tecnologías y diseño que prefieras

### 📦 Entregable

Tu repositorio de GitHub debe incluir:

#### **1. Código Fuente**
- ✅ Código completo y funcional
- ✅ Estructura de proyecto clara y organizada
- ✅ Comentarios en código complejo
- ✅ Archivo `requirements.txt` o `pyproject.toml` con dependencias
- ✅ Variables de entorno documentadas (`.env.example`)

#### **2. README.md Completo**

El README debe incluir:

```markdown
# [Nombre de tu Aplicación]

## 📋 Descripción
[Breve descripción del proyecto]

## 🏗️ Arquitectura
[Diagrama o explicación detallada de la arquitectura]
- Componentes principales
- Flujo de datos
- Tecnologías utilizadas

## 🚀 Instalación y Configuración
[Paso a paso para ejecutar tu proyecto]

## 💡 Decisiones de Diseño
[Explica por qué elegiste ciertas tecnologías o enfoques]

## 🎥 Video Demo
[Link al video demo]

```

#### **3. Video Demo (3-5 minutos)**

Debe mostrar:
- ✅ Subida de documentos (al menos 2 tipos diferentes)
- ✅ Confirmación de indexación exitosa
- ✅ Realizar consultas en el chat
- ✅ Mostrar que las respuestas están fundamentadas (grounding)
- ✅ Demostrar memoria conversacional (preguntas de seguimiento)
- ✅ Mostrar citations/fuentes
- ✅ (Opcional) Extras implementados
---

## ⭐ Extras (Opcional - Puntos Adicionales)

Tienes **total libertad** para ampliar tu aplicación con features adicionales que demuestren dominio avanzado de RAG.

Libertad total, os podéis poner creativos

---

## 🎤 Presentaciones

Se elegirán **alumnos al azar** para presentar su solución a la clase (10-15 minutos por presentación).

**En la presentación deberás:**
- Explicar tu arquitectura y decisiones técnicas
- Realizar demo en vivo de la aplicación
- Mostrar fragmentos de código relevantes
- Responder preguntas de compañeros y profesor

**Prepara respuestas para:**
- ¿Por qué elegiste esta arquitectura?
- ¿Qué desafíos encontraste y cómo los resolviste?
- ¿Cómo optimizaste el retrieval?
- ¿Qué aprendiste en el proceso?

---

## 🚀 ¡Adelante!

Esta práctica te permitirá construir una aplicación RAG real y funcional que podrás:
- 📂 Incluir en tu portafolio
- 💼 Mostrar en entrevistas técnicas
- 🔧 Usar como base para proyectos futuros
- 🧠 Entender a fondo cómo funciona RAG en producción

**¡Suerte y diviértete construyendo tu aplicación RAG!** 🎉

---

