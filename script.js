// Biblioteca de Prompts IA - JavaScript Principal
// Implementação completa com IndexedDB, CRUD, filtros e funcionalidade mobile

class PromptLibraryApp {
    constructor() {
        this.db = null;
        this.currentPrompts = [];
        this.allTags = [];
        this.currentFilters = {
            search: '',
            tags: [],
            favorites: false,
            sort: 'dataModificacao'
        };
        this.editingPrompt = null;
        this.swipeThreshold = 100;
        this.highlightedIndex = -1;
        
        this.init();
    }

    /**
     * Initializes the application.
     */
    async init() {
        await this.initDatabase();
        this.initEventListeners();
        this.loadTheme();
        this.loadFontSize();
        await this.loadData();
        this.handleUrlParams();
        await this.updateServiceWorkerCache();
    }

    // PASSO 1: ESTRUTURA DE DADOS E PERSISTÊNCIA (IndexedDB)
    /**
     * Initializes the IndexedDB database and its object stores.
     * @returns {Promise<void>} A promise that resolves when the database is ready.
     */
    async initDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('PromptLibraryDB', 1);
            
            request.onerror = (event) => reject(`Database error: ${event.target.errorCode}`);
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                if (!db.objectStoreNames.contains('prompts')) {
                    const promptStore = db.createObjectStore('prompts', { keyPath: 'id', autoIncrement: true });
                    promptStore.createIndex('dataModificacao', 'dataModificacao', { unique: false });
                    promptStore.createIndex('titulo', 'titulo', { unique: false });
                    promptStore.createIndex('tags', 'tags', { unique: false, multiEntry: true });
                    promptStore.createIndex('isFavorito', 'isFavorito', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('tags')) {
                    const tagStore = db.createObjectStore('tags', { keyPath: 'id', autoIncrement: true });
                    tagStore.createIndex('nome', 'nome', { unique: true });
                }
            };
        });
    }

    // --- Funções CRUD para Prompts ---

    /**
     * Creates a new prompt in the database.
     * @param {object} promptData - The data for the new prompt.
     * @returns {Promise<number>} The ID of the newly created prompt.
     */
    async createPrompt(promptData) {
        const transaction = this.db.transaction(['prompts'], 'readwrite');
        const store = transaction.objectStore('prompts');
        const prompt = {
            ...promptData,
            dataModificacao: new Date().toISOString(),
            isFavorito: promptData.isFavorito || false
        };
        return new Promise((resolve, reject) => {
            const request = store.add(prompt);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Retrieves all prompts from the database.
     * @returns {Promise<Array<object>>} A promise that resolves with an array of prompts.
     */
    async getPrompts() {
        const transaction = this.db.transaction(['prompts'], 'readonly');
        const store = transaction.objectStore('prompts');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Updates an existing prompt in the database.
     * @param {number} id - The ID of the prompt to update.
     * @param {object} promptData - The new data for the prompt.
     * @returns {Promise<number>} The ID of the updated prompt.
     */
    async updatePrompt(id, promptData) {
        const transaction = this.db.transaction(['prompts'], 'readwrite');
        const store = transaction.objectStore('prompts');
        const prompt = {
            ...promptData,
            id: id,
            dataModificacao: new Date().toISOString()
        };
        return new Promise((resolve, reject) => {
            const request = store.put(prompt);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    /**
     * Deletes a prompt from the database.
     * @param {number} id - The ID of the prompt to delete.
     * @returns {Promise<void>} A promise that resolves when the prompt is deleted.
     */
    async deletePrompt(id) {
        const transaction = this.db.transaction(['prompts'], 'readwrite');
        const store = transaction.objectStore('prompts');
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // --- Funções CRUD para Tags ---

    async createTag(tagData) {
        const transaction = this.db.transaction(['tags'], 'readwrite');
        const store = transaction.objectStore('tags');
        return new Promise((resolve, reject) => {
            const request = store.add(tagData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }

    async getTags() {
        const transaction = this.db.transaction(['tags'], 'readonly');
        const store = transaction.objectStore('tags');
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = (event) => reject(event.target.error);
        });
    }
    
    async deleteTag(id) {
        const transaction = this.db.transaction(['tags'], 'readwrite');
        const store = transaction.objectStore('tags');
        return new Promise((resolve, reject) => {
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = (event) => reject(event.target.error);
        });
    }

    // PASSO 4: LÓGICA DA APLICAÇÃO
    /**
     * Binds all application event listeners to their respective DOM elements.
     */
    initEventListeners() {
        // Header controls
        document.getElementById('new-prompt-btn').addEventListener('click', () => this.openPromptModal());
        document.getElementById('theme-toggle').addEventListener('click', () => this.toggleTheme());
        document.getElementById('font-decrease').addEventListener('click', () => this.adjustFontSize(-1));
        document.getElementById('font-increase').addEventListener('click', () => this.adjustFontSize(1));
        document.getElementById('create-first-prompt-btn').addEventListener('click', () => this.openPromptModal());

        // Sidebar controls
        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('sort-select').addEventListener('change', (e) => this.handleSort(e.target.value));
        document.getElementById('favorites-filter').addEventListener('change', (e) => this.handleFavoritesFilter(e.target.checked));
        document.getElementById('new-tag-btn').addEventListener('click', () => this.openTagModal());

        // Prompt Modal
        document.getElementById('close-prompt-modal-btn').addEventListener('click', () => this.closePromptModal());
        document.getElementById('cancel-prompt-btn').addEventListener('click', () => this.closePromptModal());
        document.getElementById('prompt-form').addEventListener('submit', (e) => this.handlePromptSubmit(e));

        // Tag Modal
        document.getElementById('close-tag-modal-btn').addEventListener('click', () => this.closeTagModal());
        document.getElementById('cancel-tag-btn').addEventListener('click', () => this.closeTagModal());
        document.getElementById('tag-form').addEventListener('submit', (e) => this.handleTagSubmit(e));
        document.querySelectorAll('.color-preset').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleColorPreset(e));
        });

        // Tags Input in Prompt Modal
        const tagsInput = document.getElementById('prompt-tags');
        tagsInput.addEventListener('input', (e) => this.handleTagsInput(e));
        tagsInput.addEventListener('keydown', (e) => this.handleTagsKeydown(e));
        tagsInput.addEventListener('blur', () => setTimeout(() => this.hideAutocomplete(), 150));
        tagsInput.addEventListener('focus', (e) => {
            if (e.target.value) this.showAutocomplete(e.target.value);
        });
        
        // Event Delegation for dynamic elements
        document.getElementById('selected-tags').addEventListener('click', (e) => {
            if (e.target && e.target.classList.contains('remove-tag')) {
                e.target.parentElement.remove();
            }
        });

        // Mobile menu
        document.getElementById('mobile-menu-toggle').addEventListener('click', () => this.toggleMobileMenu());
        document.getElementById('overlay').addEventListener('click', () => this.closeMobileMenu());
        
        // Global listeners
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeAllModals();
            });
        });
        document.addEventListener('keydown', (e) => this.handleKeyboardShortcuts(e));
    }

    /**
     * Loads initial data (tags and prompts) from the database and renders them.
     */
    async loadData() {
        try {
            this.allTags = await this.getTags();
            this.renderTagsList();
            this.renderPrompts();
        } catch (error) {
            console.error("Failed to load data:", error);
            this.showToast("Erro ao carregar os dados.", "error");
        }
    }

    renderTagsList() {
        const tagsList = document.getElementById('tags-list');
        tagsList.innerHTML = '';
        this.allTags.forEach(tag => {
            const tagItem = document.createElement('div');
            tagItem.className = 'tag-item';
            tagItem.style.backgroundColor = tag.cor;
            if (this.currentFilters.tags.includes(tag.nome)) {
                tagItem.classList.add('active');
            }
            tagItem.innerHTML = `
                <span>${tag.nome}</span>
                <button class="tag-remove-btn" title="Remover tag">×</button>
            `;
            tagItem.querySelector('span').addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTagFilter(tag.nome);
            });
            tagItem.querySelector('.tag-remove-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.removeTag(tag.id, tag.nome);
            });
            tagsList.appendChild(tagItem);
        });
    }

    /**
     * Fetches, filters, sorts, and renders the list of prompts.
     */
    async renderPrompts() {
        try {
            let prompts = await this.getPrompts();
            prompts = this.applyFiltersAndSorting(prompts);
            this.currentPrompts = prompts;
            
            const promptsList = document.getElementById('prompts-list');
            const emptyState = document.getElementById('empty-state');
            const promptsCount = document.getElementById('prompts-count');
            
            promptsCount.textContent = `${prompts.length} prompt${prompts.length !== 1 ? 's' : ''}`;
            
            if (prompts.length === 0) {
                promptsList.style.display = 'none';
                emptyState.style.display = 'block';
            } else {
                promptsList.style.display = 'block';
                emptyState.style.display = 'none';
                
                // Note: For very large lists, replacing innerHTML can be a performance bottleneck.
                // A more advanced approach would involve DOM diffing to only update changed elements.
                promptsList.innerHTML = ''; 
                prompts.forEach(prompt => {
                    const promptItem = this.createPromptElement(prompt);
                    promptsList.appendChild(promptItem);
                });
            }
        } catch (error) {
            console.error("Failed to render prompts:", error);
            this.showToast("Erro ao exibir os prompts.", "error");
        }
    }
    
    /**
     * Creates a DOM element for a single prompt.
     * @param {object} prompt - The prompt data object.
     * @returns {HTMLElement} The created prompt element.
     */
    createPromptElement(prompt) {
        const promptItem = document.createElement('div');
        promptItem.className = 'prompt-item';
        promptItem.dataset.id = prompt.id;
        
        const preview = prompt.conteudo.length > 150 
            ? prompt.conteudo.substring(0, 150) + '...' 
            : prompt.conteudo;
        
        const tagsHtml = (prompt.tags || []).map(tagName => {
            const tag = this.allTags.find(t => t.nome === tagName);
            const color = tag ? tag.cor : '#64748b';
            return `<span class="prompt-tag" style="background-color: ${color}">${tagName}</span>`;
        }).join('');
        
        const dateText = new Date(prompt.dataModificacao).toLocaleDateString('pt-BR');
        
        promptItem.innerHTML = `
            <div class="prompt-header">
                <div class="prompt-title-section">
                    <h3 class="prompt-title">${prompt.titulo}</h3>
                    <div class="prompt-meta"><span>📅 ${dateText}</span></div>
                </div>
                <div class="prompt-actions">
                    <button class="action-btn favorite ${prompt.isFavorito ? 'active' : ''}" title="Favoritar">⭐</button>
                    <button class="action-btn" title="Copiar">📄</button>
                    <button class="action-btn" title="Duplicar">📋</button>
                    <button class="action-btn" title="Editar">✏️</button>
                    <button class="action-btn" title="Excluir">🗑️</button>
                </div>
            </div>
            <div class="prompt-preview">${preview}</div>
            <div class="prompt-content">${prompt.conteudo}</div>
            <button class="expand-btn">Ver mais</button>
            ${tagsHtml ? `<div class="prompt-tags">${tagsHtml}</div>` : ''}`;

        promptItem.querySelector('.favorite').addEventListener('click', () => this.toggleFavorite(prompt.id));
        promptItem.querySelector('[title="Copiar"]').addEventListener('click', () => this.copyPrompt(prompt.id));
        promptItem.querySelector('[title="Duplicar"]').addEventListener('click', () => this.duplicatePrompt(prompt.id));
        promptItem.querySelector('[title="Editar"]').addEventListener('click', () => this.editPrompt(prompt.id));
        promptItem.querySelector('[title="Excluir"]').addEventListener('click', () => this.deletePromptConfirm(prompt.id));
        promptItem.querySelector('.expand-btn').addEventListener('click', (e) => this.toggleExpand(prompt.id, e.target));
        
        this.addTouchEvents(promptItem);
        return promptItem;
    }
    
    addTouchEvents(element) {
        let startX = 0, startY = 0, currentX = 0, isDragging = false;
        element.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            isDragging = false;
        });
        element.addEventListener('touchmove', (e) => {
            currentX = e.touches[0].clientX;
            const currentY = e.touches[0].clientY;
            if (!isDragging && Math.abs(startX - currentX) > 10 && Math.abs(startX - currentX) > Math.abs(startY - currentY)) {
                isDragging = true;
            }
            if(isDragging){
                const diff = currentX - startX;
                if (diff < 0) element.style.transform = `translateX(${diff}px)`;
            }
        });
        element.addEventListener('touchend', () => {
            if (!isDragging) return;
            const diff = currentX - startX;
            if (diff < -this.swipeThreshold) {
                this.deletePromptConfirm(parseInt(element.dataset.id, 10));
            }
            element.style.transition = 'transform 0.3s ease';
            element.style.transform = 'translateX(0)';
            element.addEventListener('transitionend', () => {
                element.style.transition = '';
            }, { once: true });
            startX = currentX = startY = 0;
            isDragging = false;
        });
    }

    applyFiltersAndSorting(prompts) {
        let filtered = [...prompts];
        if (this.currentFilters.search) {
            const term = this.currentFilters.search.toLowerCase();
            filtered = filtered.filter(p => p.titulo.toLowerCase().includes(term) || p.conteudo.toLowerCase().includes(term) || (p.tags || []).some(tag => tag.toLowerCase().includes(term)));
        }
        if (this.currentFilters.tags.length > 0) {
            filtered = filtered.filter(p => this.currentFilters.tags.every(tag => (p.tags || []).includes(tag)));
        }
        if (this.currentFilters.favorites) {
            filtered = filtered.filter(p => p.isFavorito);
        }
        filtered.sort((a, b) => {
            if (this.currentFilters.sort === 'titulo') {
                return a.titulo.localeCompare(b.titulo);
            }
            return new Date(b.dataModificacao) - new Date(a.dataModificacao);
        });
        return filtered;
    }

    handleSearch(term) { this.currentFilters.search = term; this.renderPrompts(); }
    handleSort(sortBy) { this.currentFilters.sort = sortBy; this.renderPrompts(); }
    handleFavoritesFilter(isFavorite) { this.currentFilters.favorites = isFavorite; this.renderPrompts(); }
    toggleTagFilter(tagName) {
        const index = this.currentFilters.tags.indexOf(tagName);
        if (index > -1) {
            this.currentFilters.tags.splice(index, 1);
        } else {
            this.currentFilters.tags.push(tagName);
        }
        this.renderTagsList();
        this.renderPrompts();
    }
    async copyPrompt(id) {
        const prompt = this.currentPrompts.find(p => p.id === id);
        if (prompt) {
            try {
                await navigator.clipboard.writeText(prompt.conteudo);
                this.showToast('Copiado para a área de transferência!', 'success');
            } catch (error) {
                console.error('Failed to copy text: ', error);
                this.showToast('Erro ao copiar.', 'error');
            }
        }
    }
    async toggleFavorite(id) {
        try {
            const prompts = await this.getPrompts();
            const prompt = prompts.find(p => p.id === id);
            if (prompt) {
                prompt.isFavorito = !prompt.isFavorito;
                await this.updatePrompt(id, prompt);
                this.renderPrompts();
            }
        } catch (error) {
            console.error('Failed to toggle favorite:', error);
            this.showToast('Erro ao favoritar.', 'error');
        }
    }
    duplicatePrompt(id) {
        const prompt = this.currentPrompts.find(p => p.id === id);
        if (prompt) {
            const { titulo, conteudo, tags } = prompt;
            this.openPromptModal({ titulo: `${titulo} (Cópia)`, conteudo, tags, isFavorito: false });
        }
    }
    editPrompt(id) {
        const prompt = this.currentPrompts.find(p => p.id === id);
        if (prompt) {
            this.editingPrompt = prompt;
            this.openPromptModal(prompt);
        }
    }
    async deletePromptConfirm(id) {
        if (confirm('Tem certeza que deseja excluir este prompt?')) {
            try {
                await this.deletePrompt(id);
                await this.renderPrompts();
                await this.updateServiceWorkerCache();
                this.showToast('Prompt excluído com sucesso.', 'success');
            } catch (error) {
                console.error('Failed to delete prompt:', error);
                this.showToast('Erro ao excluir o prompt.', 'error');
            }
        }
    }
    toggleExpand(id, button) {
        const item = document.querySelector(`.prompt-item[data-id='${id}']`);
        item.classList.toggle('expanded');
        button.textContent = item.classList.contains('expanded') ? 'Ver menos' : 'Ver mais';
    }

    // --- Modal Handling ---
    openPromptModal(promptData = null) {
        const modal = document.getElementById('prompt-modal');
        const form = document.getElementById('prompt-form');
        form.reset();
        document.getElementById('selected-tags').innerHTML = '';
        if (promptData) {
            document.getElementById('modal-title').textContent = this.editingPrompt ? 'Editar Prompt' : 'Novo Prompt';
            document.getElementById('prompt-title').value = promptData.titulo || '';
            document.getElementById('prompt-content').value = promptData.conteudo || '';
            document.getElementById('prompt-favorite').checked = promptData.isFavorito || false;
            (promptData.tags || []).forEach(tag => this.addSelectedTag(tag, true));
        } else {
            document.getElementById('modal-title').textContent = 'Novo Prompt';
            this.editingPrompt = null;
        }
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
        document.getElementById('prompt-title').focus();
    }
    closePromptModal() {
        const modal = document.getElementById('prompt-modal');
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
        this.editingPrompt = null;
    }
    async handlePromptSubmit(e) {
        e.preventDefault();
        const selectedTags = Array.from(document.getElementById('selected-tags').children).map(tagEl => tagEl.textContent.replace('×', '').trim());
        const promptData = {
            titulo: document.getElementById('prompt-title').value,
            conteudo: document.getElementById('prompt-content').value,
            tags: selectedTags,
            isFavorito: document.getElementById('prompt-favorite').checked,
        };
        try {
            if (this.editingPrompt) {
                await this.updatePrompt(this.editingPrompt.id, promptData);
                this.showToast('Prompt atualizado com sucesso!', 'success');
            } else {
                await this.createPrompt(promptData);
                this.showToast('Prompt criado com sucesso!', 'success');
            }
            this.closePromptModal();
            await this.loadData();
            await this.updateServiceWorkerCache();
        } catch (error) {
            console.error('Failed to save prompt:', error);
            this.showToast('Erro ao salvar o prompt.', 'error');
        }
    }
    
    // --- Tags Input Autocomplete ---
    handleTagsInput(e) { const value = e.target.value.trim(); value.length > 0 ? this.showAutocomplete(value) : this.hideAutocomplete(); }
    handleTagsKeydown(e) {
        const autocomplete = document.getElementById('tags-autocomplete');
        const items = autocomplete.querySelectorAll('.autocomplete-item');
        switch (e.key) {
            case 'Enter':
            case ',':
                e.preventDefault();
                if (this.highlightedIndex >= 0 && items[this.highlightedIndex]) {
                    this.selectAutocompleteItem(items[this.highlightedIndex]);
                } else {
                    this.addTagFromInput();
                }
                break;
            case 'ArrowDown': e.preventDefault(); this.highlightedIndex = Math.min(this.highlightedIndex + 1, items.length - 1); this.updateHighlight(); break;
            case 'ArrowUp': e.preventDefault(); this.highlightedIndex = Math.max(this.highlightedIndex - 1, -1); this.updateHighlight(); break;
            case 'Escape': this.hideAutocomplete(); break;
        }
    }
    showAutocomplete(query) {
        const autocomplete = document.getElementById('tags-autocomplete');
        const filteredTags = this.allTags.filter(tag => tag.nome.toLowerCase().includes(query.toLowerCase()) && !this.isTagSelected(tag.nome));
        let html = filteredTags.map(tag => `<div class="autocomplete-item" data-tag-name="${tag.nome}"><div class="autocomplete-tag-color" style="background-color: ${tag.cor}"></div><span>${tag.nome}</span></div>`).join('');
        if (!this.allTags.some(t => t.nome.toLowerCase() === query.toLowerCase()) && query.length > 0) {
            html += `<div class="autocomplete-item create-new" data-tag-name="${query}" data-new="true"><span class="icon">+</span><span>Criar "${query}"</span></div>`;
        }
        if (html) {
            autocomplete.innerHTML = html;
            autocomplete.style.display = 'block';
            autocomplete.querySelectorAll('.autocomplete-item').forEach((item, index) => {
                item.addEventListener('click', () => this.selectAutocompleteItem(item));
                item.addEventListener('mouseenter', () => { this.highlightedIndex = index; this.updateHighlight(); });
            });
            this.highlightedIndex = -1;
        } else {
            this.hideAutocomplete();
        }
    }
    hideAutocomplete() { document.getElementById('tags-autocomplete').style.display = 'none'; this.highlightedIndex = -1; }
    updateHighlight() {
        document.querySelectorAll('#tags-autocomplete .autocomplete-item').forEach((item, index) => {
            item.classList.toggle('highlighted', index === this.highlightedIndex);
        });
    }
    async selectAutocompleteItem(item) {
        const tagName = item.dataset.tagName;
        if (item.dataset.new === 'true' && !this.allTags.some(t => t.nome.toLowerCase() === tagName.toLowerCase())) {
            const newTag = { nome: tagName, cor: '#64748b' };
            try {
                const newId = await this.createTag(newTag);
                this.allTags.push({ ...newTag, id: newId });
                this.renderTagsList();
            } catch(error) {
                this.showToast('Esta tag já existe.', 'error');
            }
        }
        this.addSelectedTag(tagName);
        document.getElementById('prompt-tags').value = '';
        this.hideAutocomplete();
    }
    addTagFromInput() {
        const input = document.getElementById('prompt-tags');
        const tagName = input.value.trim().replace(',', '');
        if (tagName && !this.isTagSelected(tagName)) {
            this.selectAutocompleteItem({ dataset: { tagName, new: 'true' } });
        }
    }
    addSelectedTag(tagName, fromLoad = false) {
        const container = document.getElementById('selected-tags');
        if (this.isTagSelected(tagName)) return;
        
        let tag = this.allTags.find(t => t.nome.toLowerCase() === tagName.toLowerCase());
        
        if (!tag && !fromLoad) {
             tag = { nome: tagName, cor: '#64748b' };
        } else if (!tag && fromLoad) {
            return; // Don't add a tag that doesn't exist when loading a prompt
        }
        
        const tagEl = document.createElement('span');
        tagEl.className = 'selected-tag';
        tagEl.style.backgroundColor = tag.cor;
        tagEl.innerHTML = `${tag.nome}<button type="button" class="remove-tag">×</button>`;
        container.appendChild(tagEl);
    }
    isTagSelected(tagName) { return Array.from(document.querySelectorAll('#selected-tags .selected-tag')).some(el => el.textContent.replace('×', '').trim().toLowerCase() === tagName.toLowerCase()); }

    // --- Tag Creation Modal ---
    openTagModal() { const modal = document.getElementById('tag-modal'); modal.classList.add('active'); modal.setAttribute('aria-hidden', 'false'); document.getElementById('tag-name').focus(); }
    closeTagModal() { const modal = document.getElementById('tag-modal'); modal.classList.remove('active'); modal.setAttribute('aria-hidden', 'true'); document.getElementById('tag-form').reset(); }
    async handleTagSubmit(e) {
        e.preventDefault();
        const tagName = document.getElementById('tag-name').value.trim();
        const tagColor = document.getElementById('tag-color').value;
        if (tagName) {
            try {
                await this.createTag({ nome: tagName, cor: tagColor });
                this.closeTagModal();
                await this.loadData();
                this.showToast('Tag criada com sucesso!', 'success');
            } catch (error) {
                if (error.name === 'ConstraintError') {
                    this.showToast('Erro: A tag já existe.', 'error');
                } else {
                    this.showToast('Erro ao criar a tag.', 'error');
                }
            }
        }
    }
    async removeTag(tagId, tagName) {
        try {
            const prompts = await this.getPrompts();
            const usedIn = prompts.filter(p => (p.tags || []).includes(tagName));
            let confirmMsg = `Deseja remover a tag "${tagName}"?`;
            if (usedIn.length > 0) confirmMsg += `\nEla está em uso em ${usedIn.length} prompt(s) e será removida deles.`;
            
            if (confirm(confirmMsg)) {
                for (const p of usedIn) {
                    p.tags = p.tags.filter(t => t !== tagName);
                    await this.updatePrompt(p.id, p);
                }
                await this.deleteTag(tagId);
                this.currentFilters.tags = this.currentFilters.tags.filter(t => t !== tagName);
                await this.loadData();
                this.showToast(`Tag "${tagName}" removida.`, 'success');
            }
        } catch (error) {
            console.error('Failed to remove tag:', error);
            this.showToast('Erro ao remover a tag.', 'error');
        }
    }
    handleColorPreset(e) {
        const color = e.target.dataset.color;
        document.getElementById('tag-color').value = color;
        document.querySelectorAll('.color-preset').forEach(p => p.classList.remove('active'));
        e.target.classList.add('active');
    }

    // --- UI/UX Helpers ---
    toggleTheme() {
        const isDark = document.body.classList.toggle('dark-theme');
        document.querySelector('.theme-icon').textContent = isDark ? '☀️' : '🌙';
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
    }
    loadTheme() {
        if (localStorage.getItem('theme') === 'dark') {
            document.body.classList.add('dark-theme');
            document.querySelector('.theme-icon').textContent = '☀️';
        }
    }
    adjustFontSize(direction) {
        const classes = ['font-small', '', 'font-large', 'font-extra-large'];
        let currentClass = [...document.body.classList].find(c => c.startsWith('font-')) || '';
        let currentIndex = classes.indexOf(currentClass);
        if (currentIndex === -1) currentIndex = 1;
        let newIndex = Math.max(0, Math.min(classes.length - 1, currentIndex + direction));
        classes.forEach(c => document.body.classList.remove(c));
        if (classes[newIndex]) document.body.classList.add(classes[newIndex]);
        localStorage.setItem('fontSize', classes[newIndex]);
    }
    loadFontSize() {
        const size = localStorage.getItem('fontSize');
        if (size) document.body.classList.add(size);
    }
    toggleMobileMenu() {
        document.getElementById('sidebar').classList.toggle('active');
        document.getElementById('overlay').classList.toggle('active');
        document.getElementById('mobile-menu-toggle').classList.toggle('active');
    }
    closeMobileMenu() {
        document.getElementById('sidebar').classList.remove('active');
        document.getElementById('overlay').classList.remove('active');
        document.getElementById('mobile-menu-toggle').classList.remove('active');
    }
    closeAllModals() {
        document.querySelectorAll('.modal.active').forEach(m => {
            m.classList.remove('active');
            m.setAttribute('aria-hidden', 'true');
        });
        this.editingPrompt = null;
    }
    handleKeyboardShortcuts(e) {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); this.openPromptModal(); }
        if (e.key === 'Escape') this.closeAllModals();
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') { e.preventDefault(); document.getElementById('search-input').focus(); }
    }
    handleUrlParams() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('action') === 'new') this.openPromptModal();
        if (params.get('filter') === 'favorites') {
            document.getElementById('favorites-filter').checked = true;
            this.handleFavoritesFilter(true);
        }
    }
    showToast(message, type = 'info') {
        let toast = document.getElementById('toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.className = 'toast';
            document.body.appendChild(toast);
        }
        toast.className = `toast toast-${type} toast-show`;
        toast.textContent = message;
        setTimeout(() => toast.classList.remove('toast-show'), 3000);
    }
    
    /**
     * Sends the latest prompts to the service worker for caching.
     */
    async updateServiceWorkerCache() {
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
            try {
                const allPrompts = await this.getPrompts();
                navigator.serviceWorker.controller.postMessage({
                    type: 'CACHE_RECENT_PROMPTS',
                    prompts: allPrompts
                });
            } catch (error) {
                console.error('Failed to update Service Worker cache:', error);
            }
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new PromptLibraryApp();
});

