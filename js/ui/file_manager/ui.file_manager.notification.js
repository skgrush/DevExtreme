import $ from '../../core/renderer';
import { extend } from '../../core/utils/extend';
import { isFunction } from '../../core/utils/type';
import { Deferred } from '../../core/utils/deferred';
import { getWindow, hasWindow } from '../../core/utils/window';

import Widget from '../widget/ui.widget';
import Popup from '../popup';
import Drawer from '../drawer/ui.drawer';

import FileManagerProgressPanel from './ui.file_manager.notification.progress_panel';

const window = getWindow();
const ADAPTIVE_STATE_SCREEN_WIDTH = 1000;

const FILE_MANAGER_NOTIFICATION_CLASS = 'dx-filemanager-notification';
const FILE_MANAGER_NOTIFICATION_DRAWER_CLASS = `${FILE_MANAGER_NOTIFICATION_CLASS}-drawer`;
const FILE_MANAGER_NOTIFICATION_DRAWER_PANEL_CLASS = `${FILE_MANAGER_NOTIFICATION_DRAWER_CLASS}-panel`;
const FILE_MANAGER_NOTIFICATION_POPUP_CLASS = `${FILE_MANAGER_NOTIFICATION_CLASS}-popup`;
const FILE_MANAGER_NOTIFICATION_POPUP_ERROR_CLASS = `${FILE_MANAGER_NOTIFICATION_CLASS}-popup-error`;
const FILE_MANAGER_NOTIFICATION_COMMON_CLASS = `${FILE_MANAGER_NOTIFICATION_CLASS}-common`;
const FILE_MANAGER_NOTIFICATION_SEPARATOR_CLASS = `${FILE_MANAGER_NOTIFICATION_CLASS}-separator`;
const FILE_MANAGER_NOTIFICATION_DETAILS_CLASS = `${FILE_MANAGER_NOTIFICATION_CLASS}-details`;
const FILE_MANAGER_NOTIFICATION_COMMON_NO_ITEM_CLASS = `${FILE_MANAGER_NOTIFICATION_CLASS}-common-no-item`;

export default class FileManagerNotificationControl extends Widget {

    _initMarkup() {
        super._initMarkup();

        this._initActions();

        this._actionProgressStatus = 'default';
        this._operationInProgressCount = 0;
        this._failedOperationCount = 0;
        this._isInAdaptiveState = this._isSmallScreen();

        const $progressPanelContainer = this.option('progressPanelContainer');
        const $progressDrawer = $('<div>')
            .addClass(FILE_MANAGER_NOTIFICATION_DRAWER_CLASS)
            .appendTo($progressPanelContainer);

        $('<div>')
            .addClass(FILE_MANAGER_NOTIFICATION_DRAWER_PANEL_CLASS)
            .appendTo($progressDrawer);

        const drawerOptions = extend({
            opened: false,
            position: 'right',
            template: (container) => this._ensureProgressPanelCreated(container)
        },
        this._getProgressDrawerAdaptiveOptions());

        this._progressDrawer = this._createComponent($progressDrawer, Drawer, drawerOptions);

        const $drawerContent = $progressDrawer.find(`.${FILE_MANAGER_NOTIFICATION_DRAWER_PANEL_CLASS}`).first();

        const contentRenderer = this.option('contentTemplate');
        if(isFunction(contentRenderer)) {
            contentRenderer($drawerContent);
        }
    }

    tryShowProgressPanel() {
        const promise = new Deferred();
        if(this._actionProgressStatus === 'default' || this._isProgressDrawerOpened()) {
            return promise.resolve().promise();
        }

        setTimeout(() => {
            this._progressDrawer.show().done(promise.resolve);
            this._getNotificationPopup().hide();
            this._tryHideActionProgress();
        });
        return promise.promise();
    }

    addOperation(processingMessage, allowCancel, allowProgressAutoUpdate) {
        this._operationInProgressCount++;
        const operationInfo = this._progressPanel.addOperation(processingMessage, allowCancel, allowProgressAutoUpdate);
        this._updateActionProgress(processingMessage, 'progress');
        return operationInfo;
    }

    addOperationDetails(info, details, showCloseButton) {
        this._progressPanel.addOperationDetails(info, details, showCloseButton);
    }

    updateOperationItemProgress(operationInfo, itemIndex, itemProgress, commonProgress) {
        this._progressPanel.updateOperationItemProgress(operationInfo, itemIndex, itemProgress, commonProgress);
    }

    completeOperationItem(operationInfo, itemIndex, commonProgress) {
        this._progressPanel.completeOperationItem(operationInfo, itemIndex, commonProgress);
    }

    completeOperation(info, commonText, isError, statusText) {
        this._operationInProgressCount--;
        if(isError) {
            this._failedOperationCount++;
        } else {
            this._showPopup(commonText);
        }

        this._progressPanel.completeOperation(info, commonText, isError, statusText);

        if(!this._isProgressDrawerOpened() || !this._tryHideActionProgress()) {
            const status = this._failedOperationCount === 0 ? 'success' : 'error';
            this._updateActionProgress('', status);
        }
    }

    completeSingleOperationWithError(operationInfo, errorInfo) {
        this._progressPanel.completeSingleOperationWithError(operationInfo, errorInfo.detailErrorText);
        this._notifyError(errorInfo);
    }

    addOperationDetailsError(operationInfo, errorInfo) {
        this._progressPanel.addOperationDetailsError(operationInfo, errorInfo.itemIndex, errorInfo.detailErrorText);
        this._notifyError(errorInfo);
    }

    _hideProgressPanel() {
        setTimeout(() => this._progressDrawer.hide());
    }

    _tryHideActionProgress() {
        if(this._operationInProgressCount === 0 && this._failedOperationCount === 0) {
            this._updateActionProgress('', 'default');
            return true;
        }
        return false;
    }

    _updateActionProgress(message, status) {
        this._actionProgressStatus = status;
        this._raiseActionProgress(message, status);
    }

    _isSmallScreen() {
        if(!hasWindow()) {
            return false;
        }
        return $(window).width() <= ADAPTIVE_STATE_SCREEN_WIDTH;
    }

    _dimensionChanged(dimension) {
        if(!dimension || dimension !== 'height') {
            this._checkAdaptiveState();
        }
    }

    _checkAdaptiveState() {
        const oldState = this._isInAdaptiveState;
        this._isInAdaptiveState = this._isSmallScreen();
        if(this._progressDrawer && oldState !== this._isInAdaptiveState) {
            if(this._progressPanel) {
                this._progressPanel.$element().detach();
            }
            const options = this._getProgressDrawerAdaptiveOptions();
            this._progressDrawer.option(options);
        }
    }

    _getProgressDrawerAdaptiveOptions() {
        if(this._isInAdaptiveState) {
            return {
                openedStateMode: 'overlap',
                shading: true,
                closeOnOutsideClick: true
            };
        } else {
            return {
                openedStateMode: 'shrink',
                shading: false,
                closeOnOutsideClick: false
            };
        }
    }

    _ensureProgressPanelCreated(container) {
        if(!this._progressPanel) {
            const $progressPanelElement = $('<div>').appendTo(container);
            this._progressPanel = this._createComponent($progressPanelElement, this._getProgressPanelComponent(), {
                onOperationClosed: ({ info }) => this._onProgressPanelOperationClosed(info),
                onOperationCanceled: ({ info }) => this._raiseOperationCanceled(info),
                onOperationItemCanceled: ({ item, itemIndex }) => this._raiseOperationItemCanceled(item, itemIndex),
                onPanelClosed: () => this._hideProgressPanel()
            });
        } else {
            this._progressPanel.$element().appendTo(container);
        }
    }

    _getProgressPanelComponent() {
        return FileManagerProgressPanel;
    }

    _notifyError(errorInfo) {
        this._showPopupError(errorInfo);
        this._updateActionProgress(errorInfo.commonErrorText, 'error');
    }

    _onProgressPanelOperationClosed(info) {
        if(info.hasError) {
            this._failedOperationCount--;
            this._tryHideActionProgress();
        }
    }

    _isProgressDrawerOpened() {
        return this._progressDrawer.option('opened');
    }

    _showPopup(content, errorMode) {
        if(this._isProgressDrawerOpened()) {
            return;
        }
        this._getNotificationPopup()._wrapper().toggleClass(FILE_MANAGER_NOTIFICATION_POPUP_ERROR_CLASS, !!errorMode);
        this._getNotificationPopup().option('contentTemplate', content);
        if(!this._getNotificationPopup().option('visible')) {
            this._getNotificationPopup().show();
        }
    }

    _showPopupError(errorInfo) {
        const $content = $('<div>');

        const $message = $('<div>')
            .addClass(FILE_MANAGER_NOTIFICATION_COMMON_CLASS)
            .text(errorInfo.commonErrorText);

        const $separator = $('<div>').addClass(FILE_MANAGER_NOTIFICATION_SEPARATOR_CLASS);
        $('<div>').appendTo($separator);

        const $details = $('<div>').addClass(FILE_MANAGER_NOTIFICATION_DETAILS_CLASS);

        if(errorInfo.item) {
            this._progressPanel.createErrorDetailsProgressBox($details, errorInfo.item, errorInfo.detailErrorText);
        } else {
            $message.addClass(FILE_MANAGER_NOTIFICATION_COMMON_NO_ITEM_CLASS);
            this._progressPanel.renderError($details, $separator, errorInfo.detailErrorText);
        }

        $content.append($message, $separator, $details);

        this._showPopup($content, true);
    }

    _getNotificationPopup() {
        if(!this._notificationPopup) {
            const $popup = $('<div>')
                .addClass(FILE_MANAGER_NOTIFICATION_POPUP_CLASS)
                .appendTo(this.$element());

            this._notificationPopup = this._createComponent($popup, Popup, {
                container: this.$element(),
                width: 'auto',
                height: 'auto',
                showTitle: false,
                dragEnabled: false,
                shading: false,
                visible: false,
                closeOnOutsideClick: true,
                animation: { duration: 0 },
                position: {
                    my: 'right top',
                    at: 'right top',
                    of: this.option('positionTarget'),
                    offset: '-10 -5'
                }
            });
        }
        return this._notificationPopup;
    }

    _raiseActionProgress(message, status) {
        this._actions.onActionProgress({ message, status });
    }

    _raiseOperationCanceled(info) {
        this._actions.onOperationCanceled({ info });
    }

    _raiseOperationItemCanceled(item, index) {
        this._actions.onOperationItemCanceled({ item, itemIndex: index });
    }

    _initActions() {
        this._actions = {
            onActionProgress: this._createActionByOption('onActionProgress'),
            onOperationCanceled: this._createActionByOption('onOperationCanceled'),
            onOperationItemCanceled: this._createActionByOption('onOperationItemCanceled')
        };
    }

    _getDefaultOptions() {
        return extend(super._getDefaultOptions(), {
            progressPanelContainer: null,
            contentTemplate: null,
            onActionProgress: null,
            onOperationCanceled: null,
            onOperationItemCanceled: null
        });
    }

    _optionChanged(args) {
        const name = args.name;

        switch(name) {
            case 'progressPanelContainer':
            case 'contentTemplate':
                break;
            case 'onActionProgress':
            case 'onOperationCanceled':
            case 'onOperationItemCanceled':
                this._actions[name] = this._createActionByOption(name);
                break;
            default:
                super._optionChanged(args);
        }
    }

}
